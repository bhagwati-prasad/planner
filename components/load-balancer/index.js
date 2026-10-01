// @ts-check
/**
 * The starter load balancer (spec §9). Its targets are the components at the ends of the edges
 * leaving `out`, which it lists and chooses between itself (ADR 0022). Each request goes to the
 * healthy target its algorithm picks: in turn, to the one with the fewest open requests, by the
 * edges' weights, or by a hash of the client's address. With sticky sessions, or at layer 4,
 * where it balances connections rather than requests, a client stays on its target until it
 * has been idle for idleTimeout. Every healthCheckInterval it calls each target's `health`; a
 * target leaves after unhealthyThreshold failures in a row and returns after healthyThreshold
 * passes. A target without a `health` method passes, since it answered. Requests over
 * maxConnections are rejected.
 */

/** @typedef {any} Ctx @typedef {any} Msg @typedef {{ edge: string, node: string, weight: number }} Target */

/** Points per target on the consistent-hash ring. */
const POINTS = 64
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
 * The target a new request goes to, by the balancer's algorithm.
 * @param {Ctx} ctx @param {Target[]} healthy @param {string} client
 * @returns {Target}
 */
function choose(ctx, healthy, client) {
  const { state } = ctx
  switch (ctx.props.algorithm) {
    case 'least-connections': {
      const open = (/** @type {Target} */ t) => state.active[t.edge] ?? 0
      const fewest = Math.min(...healthy.map(open))
      const least = healthy.filter(t => open(t) === fewest)
      return least[state.cursor++ % least.length]
    }
    case 'weighted': {
      // Smooth weighted round-robin, as nginx does it: the same shares, evenly spread.
      const total = healthy.reduce((sum, t) => sum + t.weight, 0)
      let best = healthy[0]
      for (const t of healthy) {
        state.current[t.edge] = (state.current[t.edge] ?? 0) + t.weight
        if (state.current[t.edge] > state.current[best.edge]) best = t
      }
      state.current[best.edge] -= total
      return best
    }
    case 'ip-hash':
      return healthy[hash(client) % healthy.length]
    case 'consistent-hash': {
      const key = hash(client)
      const ring = healthy
        .flatMap(t => Array.from({ length: POINTS }, (_, i) => ({ at: hash(`${t.node}#${i}`), t })))
        .sort((p, q) => p.at - q.at)
      return (ring.find(p => p.at >= key) ?? ring[0]).t
    }
    default:
      return healthy[state.cursor++ % healthy.length]
  }
}

export default {
  init(/** @type {Ctx} */ ctx) {
    ctx.schedule(ctx.props.healthCheckInterval, 'healthCheck')
  },

  public: {
    /** Sends a request on to a healthy target, and answers with its response. */
    async forward(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      if (state.open >= props.maxConnections) {
        ctx.metric('rejectedConnections', 1)
        return ctx.fail('CONNECTION_REJECTED', { maxConnections: props.maxConnections })
      }
      const forwarded = Object.entries(msg.headers ?? {}).find(
        ([name]) => name.toLowerCase() === 'x-forwarded-for'
      )
      const target = ctx.call('pickTarget', { client: String(forwarded?.[1] ?? 'unknown') })
      if (!target) return ctx.fail('NO_HEALTHY_TARGET', {})
      state.active[target.edge] = (state.active[target.edge] ?? 0) + 1
      ctx.metric('activeConnections', ++state.open)
      ctx.metric(`requestsPerTarget.${target.node}`, 1)
      try {
        return await ctx.send('out', null, msg.body, {
          path: msg.path,
          headers: msg.headers,
          edge: target.edge,
        })
      } catch (err) {
        const code = /** @type {any} */ (err)?.code ?? 'FAILED'
        return ctx.fail('BAD_GATEWAY', { code, node: target.node })
      } finally {
        state.active[target.edge]--
        ctx.metric('activeConnections', --state.open)
      }
    },
  },

  private: {
    /** The healthy target a client's request goes to, or null when none is healthy. */
    pickTarget(/** @type {{ client: string }} */ { client }, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const healthy = ctx
        .targets('out')
        .filter((/** @type {Target} */ t) => state.health[t.edge]?.healthy !== false)
      if (!healthy.length) return null
      const sticky = props.stickySessions || props.layer === 'l4'
      const held = sticky ? state.affinity[client] : undefined
      const kept =
        held && ctx.now - held.at < props.idleTimeout
          ? healthy.find((/** @type {Target} */ t) => t.edge === held.edge)
          : undefined
      const target = kept ?? choose(ctx, healthy, client)
      if (sticky) state.affinity[client] = { edge: target.edge, at: ctx.now }
      return target
    },

    /** Records a target's health check, and whether it is healthy now. */
    healthCheck(/** @type {{ edge: string, ok: boolean }} */ { edge, ok }, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const was = state.health[edge] ?? { healthy: true, failures: 0, passes: 0 }
      const failures = ok ? 0 : was.failures + 1
      const passes = ok ? was.passes + 1 : 0
      const healthy = was.healthy
        ? failures < props.unhealthyThreshold
        : passes >= props.healthyThreshold
      state.health[edge] = { healthy, failures, passes }
      if (healthy !== was.healthy)
        ctx.metric(
          'unhealthyTargets',
          Object.values(state.health).filter((/** @type {any} */ h) => !h.healthy).length
        )
      return healthy
    },
  },

  /** Checks every target's health, each within the interval. */
  async onTimer(/** @type {{ name: string }} */ { name }, /** @type {Ctx} */ ctx) {
    if (name !== 'healthCheck') return
    const interval = ctx.props.healthCheckInterval
    ctx.schedule(interval, 'healthCheck')
    const targets = ctx.targets('out')
    const results = await Promise.all(
      targets.map((/** @type {Target} */ t) =>
        Promise.race([
          ctx.send('out', 'health', null, { edge: t.edge }).then(
            () => true,
            (/** @type {any} */ err) => NO_HEALTH_METHOD.includes(err?.code)
          ),
          ctx.spend(interval).then(() => false),
        ])
      )
    )
    targets.forEach((/** @type {Target} */ t, /** @type {number} */ i) =>
      ctx.call('healthCheck', { edge: t.edge, ok: results[i] })
    )
  },
}
