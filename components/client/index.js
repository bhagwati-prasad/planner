// @ts-check
/**
 * The starter client (spec §9, §11 "Sources and load"): `concurrency` sessions of users, each
 * running scenarios one after another. A session picks a scenario by the scenario mix, for a
 * user drawn from the population, and runs its steps in order. A step's call names a port, and
 * a method when the edge's own should not answer it. Its path, headers and body take the
 * session's variables, written `${name}`, and its `extract` takes variables from the response by
 * `$.path`s. Each attempt crosses the client's own network, its latency, bandwidth and loss,
 * and gives up at the client timeout; a failed step is tried again after a backoff that doubles
 * each time, and a step that runs out of retries abandons its scenario. The session thinks
 * after each step. Without scenarios, each session sends one request on `out` at a time.
 */

/** @typedef {any} Ctx */

/** What an attempt settles with when the client timeout passes first. */
const TIMED_OUT = Symbol('timed out')
/** The scenario a client without scenarios runs: one request over the edge's own method. */
const DEFAULT_SCENARIO = [{ call: 'out' }]
/** Buckets per doubling of the latency histogram, each about 6% wide. */
const SUB_BUCKETS = 16

/** A scenario name by the scenario mix, or at random among them without one. @param {Ctx} ctx */
function pickScenario(ctx) {
  const names = Object.keys(ctx.props.scenarios)
  if (!names.length) return ''
  const mix = ctx.props.scenarioMix
  const weights = names.map(name => (Object.keys(mix).length ? (mix[name] ?? 0) : 1))
  let draw = ctx.random() * weights.reduce((a, b) => a + b, 0)
  for (const [i, name] of names.entries()) if ((draw -= weights[i]) < 0) return name
  return names[names.length - 1]
}

/** Starts a session on a new scenario. @param {Ctx} ctx @param {number} session */
function begin(ctx, session) {
  const user = 1 + Math.floor(ctx.random() * Math.max(1, ctx.props.population))
  ctx.state.sessions[session] = { scenario: pickScenario(ctx), step: 0, vars: { user } }
}

/** A session's scenario's steps. @param {Ctx} ctx @param {any} s */
const stepsOf = (ctx, s) => ctx.props.scenarios[s.scenario] ?? DEFAULT_SCENARIO

/**
 * A value with the session's variables in it: a string that is one `${name}` takes the
 * variable's value as it is; any other string takes each variable as text.
 * @param {unknown} value @param {Record<string, unknown>} vars @returns {any}
 */
function substitute(value, vars) {
  if (typeof value === 'string') {
    const whole = /^\$\{(\w+)\}$/.exec(value)
    if (whole && whole[1] in vars) return vars[whole[1]]
    return value.replace(/\$\{(\w+)\}/g, (text, name) => (name in vars ? String(vars[name]) : text))
  }
  if (Array.isArray(value)) return value.map(v => substitute(v, vars))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]))
  return value
}

/** What a `$.path` such as `$.user.roles[0]` finds in a response. @param {unknown} body @param {string} path */
function lookup(body, path) {
  if (!String(path).startsWith('$')) return undefined
  /** @type {any} */
  let at = body
  for (const [, key, index] of String(path)
    .slice(1)
    .matchAll(/\.([^.[\]]+)|\[(\d+)\]/g))
    at = at?.[key ?? Number(index)]
  return at
}

/**
 * The bucket of the latency histogram a latency falls in: its doubling, from microseconds, and
 * the sixteenth of it.
 * @param {number} ms
 */
function bucketOf(ms) {
  const us = Math.max(1, Math.round(ms * 1000))
  const e = 31 - Math.clz32(Math.min(us, 2 ** 31))
  return e * SUB_BUCKETS + Math.floor(((us - 2 ** e) * SUB_BUCKETS) / 2 ** e)
}

/** The highest latency in a bucket, in ms. @param {number} bucket */
function bucketTop(bucket) {
  const e = Math.floor(bucket / SUB_BUCKETS)
  return (2 ** e * (1 + ((bucket % SUB_BUCKETS) + 1) / SUB_BUCKETS)) / 1000
}

/**
 * Counts a finished step: its success, and its end-to-end latency, from its first attempt to
 * its last answer; reports the success ratio and the 99th percentile of the latency.
 * @param {Ctx} ctx @param {boolean} ok @param {number} ms
 */
function finish(ctx, ok, ms) {
  const { state } = ctx
  state.finished++
  if (ok) state.succeeded++
  ctx.metric('success', state.succeeded / state.finished)
  const bucket = bucketOf(ms)
  state.latencies[bucket] = (state.latencies[bucket] ?? 0) + 1
  let seen = 0
  const buckets = Object.keys(state.latencies)
    .map(Number)
    .sort((a, b) => a - b)
  for (const b of buckets)
    if ((seen += state.latencies[b]) >= 0.99 * state.finished) {
      ctx.metric('endToEnd.p99', bucketTop(b))
      break
    }
}

/**
 * How long an attempt takes on the client's own network: its latency, then its body at the
 * bandwidth, when that is above 0.
 * @param {Ctx} ctx @param {unknown} body
 */
function networkTime(ctx, body) {
  const { networkLatency, networkBandwidth } = ctx.props
  const bytes = JSON.stringify(body ?? null).length
  const transfer = networkBandwidth > 0 ? ((bytes * 8) / (networkBandwidth * 1e6)) * 1000 : 0
  return ctx.sample(networkLatency) + transfer
}

export default {
  init(/** @type {Ctx} */ ctx) {
    for (let session = 0; session < ctx.props.concurrency; session++) {
      begin(ctx, session)
      ctx.schedule(0, 'step', { session })
    }
  },

  private: {
    /** The request a session's current step sends, with the session's variables in it. */
    runStep(/** @type {{ session: number }} */ { session }, /** @type {Ctx} */ ctx) {
      const s = ctx.state.sessions[session]
      const step = stepsOf(ctx, s)[s.step] ?? {}
      const [port, method = null] = String(step.call ?? 'out').split('.')
      return {
        port,
        method,
        path: step.path === undefined ? undefined : substitute(step.path, s.vars),
        headers: substitute(step.headers ?? {}, s.vars),
        body: substitute(step.body ?? null, s.vars),
      }
    },

    /**
     * Ends a session's step: keeps what it extracts when it succeeded, then moves to the next
     * step, or to a new scenario after the last or a failure. Returns the think time before it.
     */
    think(
      /** @type {{ session: number, ok: boolean, body: unknown }} */ { session, ok, body },
      /** @type {Ctx} */ ctx
    ) {
      const s = ctx.state.sessions[session]
      const steps = stepsOf(ctx, s)
      const step = steps[s.step] ?? {}
      if (ok)
        for (const [name, path] of Object.entries(step.extract ?? {}))
          s.vars[name] = lookup(body, String(path))
      if (ok && s.step + 1 < steps.length) s.step++
      else begin(ctx, session)
      return ctx.sample(step.think ?? ctx.props.thinkTime)
    },

    /** The backoff before an attempt: retryBackoff, doubled for each attempt before. */
    retry(/** @type {{ attempt: number }} */ { attempt }, /** @type {Ctx} */ ctx) {
      return ctx.props.retryBackoff * 2 ** (attempt - 2)
    },
  },

  /** Runs a session's step: each attempt over the client's network, until one answers or retries run out. */
  async onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name !== 'step') return
    const { props, state } = ctx
    const request = ctx.call('runStep', { session: data.session })
    const startedAt = ctx.now
    /** @type {any} */
    let outcome
    for (let attempt = 1; ; attempt++) {
      if (attempt > 1) await ctx.spend(ctx.call('retry', { attempt }))
      ctx.metric('requestsSent', 1)
      state.pending++
      const network = networkTime(ctx, request.body)
      if (ctx.random() < props.packetLoss || network >= props.clientTimeout) {
        await ctx.spend(props.clientTimeout)
        outcome = TIMED_OUT
      } else {
        await ctx.spend(network)
        try {
          outcome = await Promise.race([
            ctx
              .send(request.port, request.method, request.body, {
                path: request.path,
                headers: request.headers,
              })
              .then((/** @type {unknown} */ body) => ({ body })),
            ctx.spend(props.clientTimeout - network).then(() => TIMED_OUT),
          ])
        } catch {
          outcome = undefined
        }
      }
      state.pending--
      if (outcome === TIMED_OUT) ctx.metric('timeouts', 1)
      if ((outcome && outcome !== TIMED_OUT) || attempt > props.retries) break
    }
    const ok = Boolean(outcome && outcome !== TIMED_OUT)
    finish(ctx, ok, ctx.now - startedAt)
    const wait = ctx.call('think', { session: data.session, ok, body: ok ? outcome.body : null })
    ctx.schedule(wait, 'step', { session: data.session })
  },
}
