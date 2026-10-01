// @ts-check
/**
 * The starter NoSQL / key-value DB (spec §9). Items live in typed state by key, and each key
 * belongs to a partition by a hash of it. A request without a key is synthetic load, which goes
 * to a partition drawn by hot-key skew, a Zipf distribution, and touches no item. Each partition
 * serves opsPerPartition each second and throttles the rest, so a hot key throttles its own
 * partition alone.
 *
 * Each write reaches every replica after its own draw of the latency. An eventual write answers
 * once the fastest replica has it, and an eventual read asks one replica, which may not have the
 * latest write yet. A strong write answers once a quorum has it, and a strong read waits for a
 * quorum and sees the latest write a quorum has. Items expire after itemTtl, when it is set.
 */

import { pow } from './math.js'

/** @typedef {any} Ctx @typedef {any} Msg */

/** A 32-bit FNV-1a hash of `text`. @param {string} text */
function hash(text) {
  let h = 0x811c9dc5
  for (const ch of text)
    h = Math.imul(h ^ /** @type {number} */ (ch.codePointAt(0)), 0x01000193) >>> 0
  return h
}

/** The replicas that make a quorum: a majority. @param {number} replicas */
const quorum = replicas => Math.floor(replicas / 2) + 1

/** An item, unless it has expired. @param {Ctx} ctx @param {string} key */
function live(ctx, key) {
  const item = ctx.state.items[key]
  const ttl = ctx.props.itemTtl
  return item && !(ttl > 0 && ctx.now - item.at >= ttl) ? item : undefined
}

/** How long a read takes: one replica's latency when eventual, a quorum's when strong. @param {Ctx} ctx */
function readLatency(ctx) {
  const { consistency, replicationFactor } = ctx.props
  if (consistency !== 'strong') return ctx.sample(ctx.props.latency)
  return ctx
    .call('replicate', { replicas: replicationFactor })
    .sort((/** @type {number} */ a, /** @type {number} */ b) => a - b)[
    quorum(replicationFactor) - 1
  ]
}

/** Reports the bytes stored. @param {Ctx} ctx */
const reportStorage = ctx => ctx.metric('storage', ctx.state.storage)

/** Routes a request to its partition, and admits it there; the partition, or null when throttled. @param {Msg} msg @param {Ctx} ctx */
function admit(msg, ctx) {
  const partition = ctx.call('route', { key: msg.body?.key ?? msg.body?.prefix })
  return ctx.call('throttle', { partition }) ? partition : { throttled: partition }
}

export default {
  public: {
    /** An item's value, or null. */
    async get(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const admitted = admit(msg, ctx)
      if (admitted?.throttled !== undefined)
        return ctx.fail('THROTTLED', { partition: admitted.throttled })
      const { key } = msg.body ?? {}
      const item = key === undefined ? undefined : live(ctx, key)
      let value = null
      if (item) {
        const { consistency, replicationFactor } = ctx.props
        const seenAt =
          consistency === 'strong'
            ? item.quorumAt
            : item.appliedAt[Math.floor(ctx.random() * replicationFactor)]
        value = seenAt <= ctx.now ? item.value : item.previous
      }
      await ctx.spend(readLatency(ctx))
      return value ?? null
    },

    /** Writes an item to every replica. */
    async put(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const admitted = admit(msg, ctx)
      if (admitted?.throttled !== undefined)
        return ctx.fail('THROTTLED', { partition: admitted.throttled })
      const { props, state } = ctx
      const { key, value } = msg.body ?? {}
      const delays = ctx.call('replicate', { replicas: props.replicationFactor })
      const sorted = [...delays].sort((a, b) => a - b)
      const acked = props.consistency === 'strong' ? sorted[quorum(delays.length) - 1] : sorted[0]
      if (key !== undefined) {
        const old = live(ctx, key)
        const size = msg.sizeBytes || props.itemSize
        state.storage += size - (state.items[key]?.size ?? 0)
        state.items[key] = {
          value,
          previous: old?.value ?? null,
          appliedAt: delays.map((/** @type {number} */ d) => ctx.now + d),
          quorumAt: ctx.now + sorted[quorum(delays.length) - 1],
          at: ctx.now,
          size,
        }
        reportStorage(ctx)
        if (props.itemTtl > 0) ctx.schedule(props.itemTtl, 'expire', { key, at: ctx.now })
      }
      await ctx.spend(acked)
      return null
    },

    /** Removes an item. */
    async delete(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const admitted = admit(msg, ctx)
      if (admitted?.throttled !== undefined)
        return ctx.fail('THROTTLED', { partition: admitted.throttled })
      const { key } = msg.body ?? {}
      const item = key === undefined ? undefined : ctx.state.items[key]
      if (item) {
        ctx.state.storage -= item.size
        delete ctx.state.items[key]
        reportStorage(ctx)
      }
      await ctx.spend(readLatency(ctx))
      return null
    },

    /** The items whose keys start with a prefix, on the prefix's partition. */
    async query(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const admitted = admit(msg, ctx)
      if (admitted?.throttled !== undefined)
        return ctx.fail('THROTTLED', { partition: admitted.throttled })
      const prefix = String(msg.body?.prefix ?? '')
      const found = Object.keys(ctx.state.items)
        .filter(key => key.startsWith(prefix) && live(ctx, key))
        .map(key => ({ key, value: ctx.state.items[key].value }))
      await ctx.spend(readLatency(ctx))
      return found
    },
  },

  private: {
    /**
     * The partition a key belongs to, by its hash; without a key, one drawn by hot-key skew,
     * where partition k of n takes a share in proportion to 1 / k^s.
     */
    route(/** @type {{ key?: unknown }} */ { key }, /** @type {Ctx} */ ctx) {
      const { partitions, hotKeySkew } = ctx.props
      if (key !== undefined) return hash(String(key)) % partitions
      const weights = Array.from({ length: partitions }, (_, k) => 1 / pow(k + 1, hotKeySkew))
      let u = ctx.random() * weights.reduce((a, b) => a + b, 0)
      for (const [k, w] of weights.entries()) if ((u -= w) < 0) return k
      return partitions - 1
    },

    /**
     * Admits an op on a partition within its opsPerPartition this second, and reports how busy it
     * is and the share of this second's ops that the busiest partition took; false when throttled.
     */
    throttle(/** @type {{ partition: number }} */ { partition }, /** @type {Ctx} */ ctx) {
      const { state } = ctx
      const second = Math.floor(ctx.now / 1000)
      const window = state.windows[partition]
      const ops = window?.second === second ? window.ops : 0
      if (ops >= ctx.props.opsPerPartition) {
        ctx.metric('throttledOps', 1)
        return false
      }
      state.windows[partition] = { second, ops: ops + 1 }
      ctx.metric('partitionOps', ops + 1)
      const now = Object.values(state.windows)
        .filter((/** @type {any} */ w) => w.second === second)
        .map((/** @type {any} */ w) => w.ops)
      ctx.metric('hotPartition', Math.max(...now) / now.reduce((a, b) => a + b, 0))
      return true
    },

    /** How long each replica takes to apply a write, in ms. */
    replicate(/** @type {{ replicas: number }} */ { replicas }, /** @type {Ctx} */ ctx) {
      return Array.from({ length: replicas }, () => ctx.sample(ctx.props.latency))
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name !== 'expire') return
    const item = ctx.state.items[data.key]
    if (item?.at !== data.at) return
    ctx.state.storage -= item.size
    delete ctx.state.items[data.key]
    reportStorage(ctx)
  },
}
