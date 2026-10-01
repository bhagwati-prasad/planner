// @ts-check
/**
 * The starter cache (spec §9). Entries live in typed state by key, each for its TTL. When a set
 * takes it past capacityItems or capacityMemory, it evicts by its policy: the entry used longest
 * ago (lru), used least, then longest ago (lfu), expiring soonest (ttl), or one at random. Each
 * entry takes its size once on its node and once on each replica.
 *
 * A get without a key is synthetic load: a key drawn from the keyspace by access skew, a Zipf
 * distribution, which a miss then fills, as its caller would. So the hit ratio follows from the
 * keyspace, the skew and the capacity.
 *
 * Writes reach its origin, when `origin` is connected, by its write policy: write-through writes
 * there first, then caches; write-around writes there and drops the cached entry; write-back
 * only caches, and writes an entry there when it is evicted or expires.
 */

import { exp, ln, pow } from './math.js'

/** @typedef {any} Ctx @typedef {any} Msg */

/**
 * A key's rank in a keyspace of n by Zipf's law with exponent s, from 1 (the hottest) to n, by
 * the inverse of a continuous power law's distribution.
 * @param {Ctx} ctx @param {number} n @param {number} s
 */
function zipfRank(ctx, n, s) {
  const u = ctx.random()
  const x = s === 1 ? exp(u * ln(n + 1)) : pow(1 + u * (pow(n + 1, 1 - s) - 1), 1 / (1 - s))
  return Math.min(n, Math.max(1, Math.floor(x)))
}

/** Whether `origin` is connected. @param {Ctx} ctx */
const hasOrigin = ctx => ctx.targets('origin').length > 0

/** Reports memory, keys and fill. @param {Ctx} ctx */
function report(ctx) {
  const { state, props } = ctx
  const keys = Object.keys(state.entries).length
  ctx.metric('memoryUsed', state.memory)
  ctx.metric('keys', keys)
  ctx.metric('fill', Math.max(keys / props.capacityItems, state.memory / props.capacityMemory))
}

/**
 * Takes an entry out, writing it to the origin first when only the cache has it.
 * @param {Ctx} ctx @param {string} key
 */
function remove(ctx, key) {
  const { state, props } = ctx
  const entry = state.entries[key]
  if (!entry) return
  if (entry.dirty && hasOrigin(ctx)) ctx.emit('origin', null, { key, value: entry.value })
  state.memory -= entry.size * (1 + props.replication)
  delete state.entries[key]
}

/**
 * Caches a value for its TTL, evicting first while it would not fit, so the cache never passes
 * its capacity and a new entry is never its own victim.
 * @param {Ctx} ctx @param {string} key @param {unknown} value @param {number} size
 * @param {number} ttl @param {boolean} dirty
 */
function store(ctx, key, value, size, ttl, dirty) {
  const { state, props } = ctx
  const copies = 1 + props.replication
  const old = state.entries[key]
  if (old) {
    state.memory -= old.size * copies
    delete state.entries[key]
  }
  while (
    Object.keys(state.entries).length + 1 > props.capacityItems ||
    state.memory + size * copies > props.capacityMemory
  )
    if (!ctx.call('evict')) break
  const expiresAt = ttl > 0 ? ctx.now + ttl : null
  state.entries[key] = { value, size, expiresAt, lastUsed: ++state.tick, uses: 1, dirty }
  state.memory += size * copies
  if (expiresAt !== null) ctx.schedule(ttl, 'expire', { key, expiresAt })
  report(ctx)
}

export default {
  public: {
    /** A key's value, or null on a miss; without a key, a key drawn by access skew. */
    get(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { state, props } = ctx
      const synthetic = msg.body?.key === undefined
      const key = synthetic
        ? `key-${zipfRank(ctx, props.keyspaceSize, props.accessSkew)}`
        : String(msg.body.key)
      let entry = state.entries[key]
      if (entry && entry.expiresAt !== null && ctx.now >= entry.expiresAt) {
        ctx.call('expire', { key, expiresAt: entry.expiresAt })
        entry = undefined
      }
      state.lookups++
      if (entry) {
        state.hits++
        entry.uses++
        entry.lastUsed = ++state.tick
      }
      ctx.metric('hitRatio', state.hits / state.lookups)
      if (!entry && synthetic) store(ctx, key, null, msg.sizeBytes ?? 0, props.ttl, false)
      return entry ? entry.value : null
    },

    /** Caches a value and writes it to the origin by the write policy. */
    async set(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props } = ctx
      const { key, value, ttl } = msg.body ?? {}
      const origin = hasOrigin(ctx)
      if (origin && props.writePolicy !== 'write-back') {
        try {
          await ctx.send('origin', null, { key, value })
        } catch (err) {
          return ctx.fail('ORIGIN_FAILED', { code: /** @type {any} */ (err)?.code ?? 'FAILED' })
        }
      }
      if (props.writePolicy === 'write-around') {
        remove(ctx, String(key))
        report(ctx)
        return null
      }
      const dirty = origin && props.writePolicy === 'write-back'
      store(ctx, String(key), value, msg.sizeBytes ?? 0, ttl ?? props.ttl, dirty)
      return null
    },

    /** Drops a key. */
    delete(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      remove(ctx, String(msg.body?.key))
      report(ctx)
      return null
    },
  },

  private: {
    /** Evicts one entry by the eviction policy, and returns its key; null when it is empty. */
    evict(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const entries = Object.entries(ctx.state.entries)
      if (!entries.length) return null
      /** @param {(e: any) => number[]} rank the entry with the smallest rank goes */
      const least = rank =>
        entries.reduce((best, e) => {
          const [a, b] = [rank(e[1]), rank(best[1])]
          return a[0] < b[0] || (a[0] === b[0] && (a[1] ?? 0) < (b[1] ?? 0)) ? e : best
        })[0]
      const key =
        ctx.props.eviction === 'lfu'
          ? least(e => [e.uses, e.lastUsed])
          : ctx.props.eviction === 'ttl'
            ? least(e => [e.expiresAt ?? Infinity, e.lastUsed])
            : ctx.props.eviction === 'random'
              ? entries[Math.floor(ctx.random() * entries.length)][0]
              : least(e => [e.lastUsed])
      remove(ctx, key)
      ctx.metric('evictions', 1)
      return key
    },

    /** Drops an entry whose TTL has passed, if it is still the one that expires then. */
    expire(
      /** @type {{ key: string, expiresAt: number }} */ { key, expiresAt },
      /** @type {Ctx} */ ctx
    ) {
      if (ctx.state.entries[key]?.expiresAt !== expiresAt) return false
      remove(ctx, key)
      report(ctx)
      return true
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'expire') ctx.call('expire', data)
  },
}
