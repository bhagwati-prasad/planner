// @ts-check
/**
 * The starter service (spec §9). Its instances × concurrency servers, which the kernel models
 * from the manifest's `servers` (ADR 0020), run each request; the rest wait in the backlog, up to
 * maxBacklog, for at most the timeout. A request runs the endpoint its path and `method` header
 * match, spends the endpoint's service time (ADR 0021), then makes the endpoint's downstream
 * calls in order and answers with their replies. Each call goes through a circuit breaker of its
 * own and is tried again after a backoff that doubles each time. Autoscaling adds an instance
 * once utilisation has stayed over its target for the scale-up delay, and removes one when one
 * fewer would be at or under the target, at most once per cooldown.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

/** How often autoscaling looks at utilisation, in ms. */
const EVALUATE_MS = 10_000
/** A circuit breaker judges its dependency by this many of its last calls... */
const WINDOW = 10
/** ...and opens on no fewer than this many. */
const MINIMUM_CALLS = 5

/**
 * The verb and path an endpoint's name gives: 'GET /orders', or '/orders' for any verb.
 * @param {unknown} name
 */
function route(name) {
  const [first = '/', second] = String(name ?? '/')
    .trim()
    .split(/\s+/)
  return second === undefined
    ? { verb: null, path: first }
    : { verb: first.toUpperCase(), path: second }
}

/** Whether `path` is `prefix` or below it, segment by segment. @param {string} path @param {string} prefix */
const under = (path, prefix) =>
  prefix === '/' || path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)

/** Counts a failed request, and answers it with `code`. @param {Ctx} ctx @param {string} code @param {object} details */
function failure(ctx, code, details) {
  ctx.metric('errors', 1)
  return ctx.fail(code, details)
}

/** Whether the breaker in front of `call` refuses calls now. @param {Ctx} ctx @param {string} call */
const isOpen = (ctx, call) => ctx.props.circuitBreaker && ctx.state.circuits[call]?.state === 'open'

/**
 * Moves the breaker in front of `call` to `to`, starting its window afresh; an open one
 * half-opens after the open duration.
 * @param {Ctx} ctx @param {string} call @param {'closed'|'open'|'half-open'} to
 */
function setCircuit(ctx, call, to) {
  ctx.state.circuits[call] = { state: to, outcomes: [] }
  ctx.metric(`circuitState.${call}`, to)
  if (to === 'open') ctx.schedule(ctx.props.breakerOpenDuration, 'halfOpen', { call })
}

export default {
  init(/** @type {Ctx} */ ctx) {
    ctx.state.liveInstances = ctx.props.instances
    ctx.metric('liveInstances', ctx.props.instances)
    if (ctx.props.autoscaling) ctx.schedule(EVALUATE_MS, 'autoscale')
  },

  public: {
    /** Runs the endpoint the request matches, and answers with its calls' replies, by call. */
    async request(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const path = msg.path ?? '/'
      const verb = msg.headers?.method ?? null
      const endpoint = ctx.call('admit', { path, verb })
      if (!endpoint) return failure(ctx, 'NO_ENDPOINT', { path, method: verb })
      ctx.metric('inFlight', ++ctx.state.inFlight)
      try {
        await ctx.spend(endpoint.serviceTime ?? ctx.props.serviceTime)
        /** @type {Record<string, unknown>} */
        const body = {}
        for (const call of endpoint.calls ?? []) {
          const [port, method = null] = String(call).split('.')
          for (let attempt = 1; ; attempt++) {
            if (isOpen(ctx, call)) return failure(ctx, 'CIRCUIT_OPEN', { call })
            let code = null
            try {
              body[call] = await ctx.send(port, method, msg.body)
            } catch (err) {
              code = /** @type {any} */ (err)?.code ?? 'FAILED'
            }
            if (ctx.props.circuitBreaker) ctx.call('tripCircuit', { call, ok: code === null })
            if (code === null) break
            const backoff = ctx.call('retry', { attempt })
            if (backoff === null)
              return failure(ctx, 'DEPENDENCY_FAILED', {
                port,
                ...(method ? { method } : {}),
                code,
              })
            await ctx.spend(backoff)
          }
        }
        return body
      } finally {
        ctx.metric('inFlight', --ctx.state.inFlight)
      }
    },

    health: (/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) => ({
      status: ctx.state.health,
      liveInstances: ctx.state.liveInstances,
    }),
  },

  private: {
    /**
     * The endpoint a request runs: of those whose verb and path match, the one with the longest
     * path. With no endpoints, every request runs one that calls nothing.
     */
    admit(
      /** @type {{ path: string, verb: string|null }} */ { path, verb },
      /** @type {Ctx} */ ctx
    ) {
      const endpoints = ctx.props.endpoints ?? []
      if (!endpoints.length) return { calls: [] }
      let best = null
      let longest = -1
      for (const endpoint of endpoints) {
        const want = route(endpoint.name)
        if (want.verb && want.verb !== String(verb ?? '').toUpperCase()) continue
        if (!under(path, want.path) || want.path.length <= longest) continue
        best = endpoint
        longest = want.path.length
      }
      return best
    },

    /** How long to wait before trying a failed call again, or null when no retries are left. */
    retry(/** @type {{ attempt: number }} */ { attempt }, /** @type {Ctx} */ ctx) {
      return attempt > ctx.props.retries ? null : ctx.props.retryBackoff * 2 ** (attempt - 1)
    },

    /**
     * Records how a call went: a half-open breaker closes on a success and opens again on a
     * failure; a closed one opens when failures reach the error threshold of its window.
     */
    tripCircuit(/** @type {{ call: string, ok: boolean }} */ { call, ok }, /** @type {Ctx} */ ctx) {
      const circuit = ctx.state.circuits[call] ?? { state: 'closed', outcomes: [] }
      if (circuit.state === 'half-open') return setCircuit(ctx, call, ok ? 'closed' : 'open')
      const outcomes = [...circuit.outcomes, ok].slice(-WINDOW)
      const failed = outcomes.filter(o => !o).length
      if (
        outcomes.length >= MINIMUM_CALLS &&
        failed >= ctx.props.breakerErrorThreshold * outcomes.length
      )
        return setCircuit(ctx, call, 'open')
      ctx.state.circuits[call] = { state: circuit.state, outcomes }
    },

    /**
     * Adds an instance when utilisation has been over its target for the scale-up delay, or
     * removes one when one fewer would be at or under it, at most once per cooldown. It never
     * goes below one instance, since it sees only the requests on its servers.
     */
    autoscale(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const { concurrency, targetUtilisation, scaleUpDelay, cooldown, minInstances, maxInstances } =
        ctx.props
      const { state } = ctx
      const live = state.liveInstances
      const fits = (/** @type {number} */ n) =>
        state.inFlight <= targetUtilisation * n * concurrency
      if (fits(live)) state.busySince = -1
      else if (state.busySince < 0) state.busySince = ctx.now
      let to = live
      if (!fits(live) && ctx.now - state.busySince >= scaleUpDelay && live < maxInstances)
        to = live + 1
      else if (live > Math.max(1, minInstances) && fits(live - 1)) to = live - 1
      const cooled = state.lastScaledAt < 0 || ctx.now - state.lastScaledAt >= cooldown
      if (to === live || !cooled) return live
      state.liveInstances = to
      state.lastScaledAt = ctx.now
      state.busySince = -1
      ctx.metric('liveInstances', to)
      return to
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'autoscale') {
      ctx.call('autoscale')
      ctx.schedule(EVALUATE_MS, 'autoscale')
    } else if (name === 'halfOpen' && ctx.state.circuits[data.call]?.state === 'open')
      setCircuit(ctx, data.call, 'half-open')
  },
}
