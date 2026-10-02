// @ts-check
/**
 * The starter CDN (spec §9). Each get is served at an edge location: the one a hash of the
 * client's address picks, or one at random when it gives none. The location's edge cache answers
 * with its copy until the copy is cacheTtl old. A miss goes to the origin shield, when there is
 * one, which fills every location from one origin fetch per TTL; without it, each location
 * fetches its own copy. A get without a key or path is synthetic load: a key drawn from the
 * keyspace by popularity skew, a Zipf distribution, unless fixedHitRatio sets how often the edge
 * hits. Each response sends its object to the client, which counts as egress.
 */

import { exp, ln, pow } from './math.js'

/** @typedef {any} Ctx @typedef {any} Msg */

/** What a fetch from the origin settles with when the origin timeout passes first. */
const TIMED_OUT = Symbol('timed out')

/** A 32-bit FNV-1a hash of `text`. @param {string} text */
function hash(text) {
  let h = 0x811c9dc5
  for (const ch of text)
    h = Math.imul(h ^ /** @type {number} */ (ch.codePointAt(0)), 0x01000193) >>> 0
  return h
}

/**
 * A key's rank in a keyspace of n by Zipf's law with exponent s, from 1 (the most popular) to n,
 * by the inverse of a continuous power law's distribution.
 * @param {Ctx} ctx @param {number} n @param {number} s
 */
function zipfRank(ctx, n, s) {
  const u = ctx.random()
  const x = s === 1 ? exp(u * ln(n + 1)) : pow(1 + u * (pow(n + 1, 1 - s) - 1), 1 / (1 - s))
  return Math.min(n, Math.max(1, Math.floor(x)))
}

/** A header's value, whatever its case. @param {Msg} msg @param {string} name */
const header = (msg, name) =>
  Object.entries(msg.headers ?? {}).find(([n]) => n.toLowerCase() === name)?.[1]

/** A copy, unless it has expired. @param {Ctx} ctx @param {any} copy */
const fresh = (ctx, copy) => (copy && ctx.now < copy.expiresAt ? copy : undefined)

/**
 * Keeps a copy in a tier of the cache until it expires.
 * @param {Ctx} ctx @param {'edge'|'shield'} tier @param {string} id @param {any} copy
 */
function keep(ctx, tier, id, copy) {
  ctx.state[tier][id] = copy
  ctx.schedule(copy.expiresAt - ctx.now, 'evict', { tier, id, expiresAt: copy.expiresAt })
}

export default {
  public: {
    /** An object's body, from the edge cache, the shield or the origin. */
    async get(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const key = String(
        msg.body?.key ??
          msg.path ??
          `/object-${zipfRank(ctx, props.keyspaceSize, props.popularitySkew)}`
      )
      const client = header(msg, 'x-forwarded-for')
      const location =
        client === undefined
          ? Math.floor(ctx.random() * props.edgeLocations)
          : hash(String(client)) % props.edgeLocations
      const latency = ctx.sample(props.edgeLatency)
      ctx.metric('edgeLatency', latency)
      await ctx.spend(latency)
      const id = `${location} ${key}`
      let copy = fresh(ctx, state.edge[id])
      const hit =
        props.fixedHitRatio === undefined ? copy !== undefined : ctx.random() < props.fixedHitRatio
      state.lookups++
      if (hit) state.hits++
      ctx.metric('hitRatio', state.hits / state.lookups)
      if (!hit) {
        copy = undefined
        if (props.originShield) {
          await ctx.spend(ctx.sample(props.edgeLatency))
          copy = fresh(ctx, state.shield[key])
        }
        if (!copy) {
          let body
          try {
            body = await ctx.call('fetchFromOrigin', { key, path: msg.path, headers: msg.headers })
          } catch (err) {
            return ctx.fail('BAD_GATEWAY', { code: /** @type {any} */ (err)?.code ?? 'FAILED' })
          }
          if (body === TIMED_OUT)
            return ctx.fail('ORIGIN_TIMEOUT', { timeoutMs: props.originTimeout })
          const size = msg.sizeBytes || JSON.stringify(body ?? null).length
          copy = { body, size, expiresAt: ctx.now + props.cacheTtl }
          if (props.originShield) keep(ctx, 'shield', key, copy)
        }
        keep(ctx, 'edge', id, { ...copy })
      }
      const size = copy?.size ?? msg.sizeBytes ?? 0
      ctx.metric('egress', size / 1e9)
      if (props.bandwidth > 0) await ctx.spend(((size * 8) / (props.bandwidth * 1e9)) * 1000)
      return copy ? copy.body : null
    },
  },

  private: {
    /**
     * Starts a fetch from the origin, and returns what it settles with: the origin's body, or
     * TIMED_OUT when the origin timeout passes first.
     */
    fetchFromOrigin(
      /** @type {{ key: string, path?: string, headers?: Record<string, string> }} */ request,
      /** @type {Ctx} */ ctx
    ) {
      ctx.metric('originRequests', 1)
      return Promise.race([
        ctx.send('out', null, null, {
          path: request.path ?? request.key,
          headers: request.headers,
        }),
        ctx.spend(ctx.props.originTimeout).then(() => TIMED_OUT),
      ])
    },

    /** Drops a copy whose TTL has passed, if it is still the one that expires then. */
    evict(
      /** @type {{ tier: 'edge'|'shield', id: string, expiresAt: number }} */ {
        tier,
        id,
        expiresAt,
      },
      /** @type {Ctx} */ ctx
    ) {
      if (ctx.state[tier][id]?.expiresAt !== expiresAt) return false
      delete ctx.state[tier][id]
      return true
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'evict') ctx.call('evict', data)
  },
}
