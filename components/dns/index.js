// @ts-check
/**
 * The starter DNS (spec §9). Its records are the edges leaving `out`, each pointing names at the
 * component at its end (ADR 0022). A lookup answers with one healthy record by the routing
 * policy: at random (simple), at random by the edges' weights (weighted), by a hash of the
 * client's address, standing in for where it is (geo), or the first healthy record in order
 * (failover). Every healthCheckInterval it calls each record's `health`; a record leaves the
 * answers after three failures in a row and returns after three passes, as Route 53's default
 * threshold has it. When every record is unhealthy, it answers as if all were healthy, as
 * Route 53 does. A client's resolver keeps each answer for recordTtl and answers from it, with
 * no resolution latency, even after a failover.
 */

/** @typedef {any} Ctx @typedef {any} Msg @typedef {{ edge: string, node: string, weight: number }} DnsRecord */

/** Checks in a row that take a record out of the answers, or bring it back. */
const THRESHOLD = 3
/** Health check failures that show the target answered, so it has no health method to call. */
const NO_HEALTH_METHOD = ['E_METHOD_NOT_EXPOSED', 'E_METHOD_UNKNOWN']

/** A 32-bit FNV-1a hash of `text`. @param {string} text */
function hash(text) {
  let h = 0x811c9dc5
  for (const ch of text)
    h = Math.imul(h ^ /** @type {number} */ (ch.codePointAt(0)), 0x01000193) >>> 0
  return h
}

/**
 * The record a lookup answers with, by the routing policy.
 * @param {Ctx} ctx @param {DnsRecord[]} records @param {string} client
 * @returns {DnsRecord}
 */
function choose(ctx, records, client) {
  switch (ctx.props.routingPolicy) {
    case 'weighted': {
      const total = records.reduce((sum, r) => sum + r.weight, 0)
      let draw = ctx.random() * total
      for (const r of records) if ((draw -= r.weight) < 0) return r
      return records[records.length - 1]
    }
    case 'geo':
      return records[hash(client) % records.length]
    case 'failover':
      return records[0]
    default:
      return records[Math.floor(ctx.random() * records.length)]
  }
}

export default {
  init(/** @type {Ctx} */ ctx) {
    ctx.schedule(ctx.props.healthCheckInterval, 'healthCheck')
  },

  public: {
    /** The address a name resolves to for a client: the component its record points at. */
    async resolve(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const name = String(msg.body?.name ?? msg.path ?? '')
      const forwarded = Object.entries(msg.headers ?? {}).find(
        ([n]) => n.toLowerCase() === 'x-forwarded-for'
      )
      const client = String(forwarded?.[1] ?? 'unknown')
      ctx.metric('queries', 1)
      const id = `${client} ${name}`
      const cached = state.answers[id]
      if (cached && ctx.now < cached.expiresAt) return { name, address: cached.address }
      await ctx.spend(ctx.sample(props.resolutionLatency))
      const records = ctx.targets('out')
      if (!records.length) return ctx.fail('NXDOMAIN', { name })
      const healthy = records.filter(
        (/** @type {DnsRecord} */ r) => state.health[r.edge]?.healthy !== false
      )
      const { node: address } = choose(ctx, healthy.length ? healthy : records, client)
      state.answers[id] = { address, expiresAt: ctx.now + props.recordTtl }
      return { name, address }
    },
  },

  private: {
    /** Records a record's health check, and whether it is healthy now. */
    healthCheck(/** @type {{ edge: string, ok: boolean }} */ { edge, ok }, /** @type {Ctx} */ ctx) {
      const { state } = ctx
      const was = state.health[edge] ?? { healthy: true, failures: 0, passes: 0 }
      const failures = ok ? 0 : was.failures + 1
      const passes = ok ? was.passes + 1 : 0
      const healthy = was.healthy ? failures < THRESHOLD : passes >= THRESHOLD
      state.health[edge] = { healthy, failures, passes }
      if (healthy !== was.healthy) ctx.call('failover', { edge, healthy })
      return healthy
    },

    /** A record leaves the answers or returns to them. */
    failover(
      /** @type {{ edge: string, healthy: boolean }} */ { edge, healthy },
      /** @type {Ctx} */ ctx
    ) {
      ctx.metric('failoverEvents', 1)
      ctx.log('info', `The record on edge ${edge} ${healthy ? 'returns to' : 'leaves'} the answers`)
    },
  },

  /** Checks every record's health, each within the interval. */
  async onTimer(/** @type {{ name: string }} */ { name }, /** @type {Ctx} */ ctx) {
    if (name !== 'healthCheck') return
    const interval = ctx.props.healthCheckInterval
    ctx.schedule(interval, 'healthCheck')
    const records = ctx.targets('out')
    const results = await Promise.all(
      records.map((/** @type {DnsRecord} */ r) =>
        Promise.race([
          ctx.send('out', 'health', null, { edge: r.edge }).then(
            () => true,
            (/** @type {any} */ err) => NO_HEALTH_METHOD.includes(err?.code)
          ),
          ctx.spend(interval).then(() => false),
        ])
      )
    )
    records.forEach((/** @type {DnsRecord} */ r, /** @type {number} */ i) =>
      ctx.call('healthCheck', { edge: r.edge, ok: results[i] })
    )
  },
}
