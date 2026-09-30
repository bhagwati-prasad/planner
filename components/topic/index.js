// @ts-check
/**
 * The starter pub/sub topic (spec §9): a log per partition, which messages join by their
 * ordering key (or in turn without one) within each partition's throughput. Each consumer
 * group reads from its own positions and commits its own offsets, so lag is per group.
 * Retention drops messages by age and by total size, and compaction keeps only the latest
 * message per key. A consumer group is one consumer here, so it gets every partition.
 */

/** @typedef {any} Msg @typedef {any} Ctx */

/** FNV-1a, so a key always picks the same partition. @param {string} text */
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** The partitions' indexes. @param {Ctx} ctx */
const partitions = ctx => Array.from({ length: ctx.props.partitions }, (_, p) => p)

/** A partition's log, created empty when first used. @param {Ctx} ctx @param {number} p */
const logOf = (ctx, p) => (ctx.state.logs[p] ??= { next: 0, messages: [] })

/** The first offset a partition still keeps. @param {Ctx} ctx @param {number} p */
const firstOffset = (ctx, p) => logOf(ctx, p).messages[0]?.offset ?? logOf(ctx, p).next

/** The bytes a partition may still take now, at its throughput. @param {Ctx} ctx @param {number} p */
function room(ctx, p) {
  const rate = ctx.props.throughputPerPartition * 1e6
  const bucket = ctx.state.buckets[p]
  const bytes = bucket ? Math.min(rate, bucket.bytes + ((ctx.now - bucket.at) / 1000) * rate) : rate
  ctx.state.buckets[p] = { bytes, at: ctx.now }
  return bytes
}

/** Removes a message from a partition's log. @param {Ctx} ctx @param {number} p @param {number} i */
function drop(ctx, p, i) {
  const [message] = logOf(ctx, p).messages.splice(i, 1)
  ctx.state.bytes -= message.sizeBytes
}

/** Reports each group's lag, the partitions' skew and the retained bytes. @param {Ctx} ctx */
function report(ctx) {
  for (const [group, { committed }] of Object.entries(ctx.state.offsets)) {
    let lag = 0
    let oldest = Infinity
    for (const p of partitions(ctx)) {
      const log = logOf(ctx, p)
      lag += log.next - Math.max(committed[p] ?? 0, firstOffset(ctx, p))
      const unread = log.messages.find((/** @type {any} */ m) => m.offset >= (committed[p] ?? 0))
      if (unread) oldest = Math.min(oldest, unread.at)
    }
    ctx.metric(`consumerLag.${group}`, lag)
    ctx.metric(`consumerLagTime.${group}`, Number.isFinite(oldest) ? (ctx.now - oldest) / 1000 : 0)
  }
  const counts = partitions(ctx).map(p => logOf(ctx, p).messages.length)
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  ctx.metric('partitionSkew', mean ? (Math.max(...counts) - mean) / mean : 0)
  ctx.metric('retainedBytes', ctx.state.bytes * ctx.props.replicationFactor)
}

export default {
  init(/** @type {Ctx} */ ctx) {
    for (const p of partitions(ctx)) logOf(ctx, p)
    for (const group of ctx.props.consumerGroups) ctx.call('assignPartitions', group)
  },

  public: {
    publish(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const body = msg.body
      const size = msg.sizeBytes ?? 0
      const dedupId = props.deliverySemantics === 'exactly-once' ? body?.dedupId : undefined
      if (dedupId !== undefined && state.dedup[dedupId])
        return { ...state.dedup[dedupId], duplicate: true }
      const key = props.orderingKey ? (body?.[props.orderingKey] ?? null) : null
      const p = (key === null ? state.published : hash(String(key))) % props.partitions
      if (size > room(ctx, p)) return ctx.fail('PARTITION_THROTTLED', { partition: p })
      state.buckets[p].bytes -= size
      state.published++
      const log = logOf(ctx, p)
      const offset = log.next++
      log.messages.push({ offset, key, body, sizeBytes: size, at: ctx.now })
      state.bytes += size
      if (dedupId !== undefined) state.dedup[dedupId] = { partition: p, offset }
      ctx.call('trimRetention')
      if (props.compaction) ctx.call('compact', p)
      ctx.metric('publishRate', 1)
      report(ctx)
      return { partition: p, offset }
    },

    subscribe(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const group = String(msg.body?.group)
      return { group, partitions: ctx.call('assignPartitions', group) }
    },

    poll(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const group = ctx.state.offsets[msg.body?.group]
      if (!group) return ctx.fail('UNKNOWN_GROUP', { group: msg.body?.group })
      const max = msg.body?.max ?? 100
      const out = []
      for (const p of group.partitions) {
        for (const m of logOf(ctx, p).messages) {
          if (out.length >= max) break
          if (m.offset < group.positions[p]) continue
          out.push({ partition: p, offset: m.offset, body: m.body })
          group.positions[p] = m.offset + 1
        }
      }
      if (ctx.props.deliverySemantics === 'at-most-once') {
        group.committed = { ...group.positions }
        report(ctx)
      }
      return out
    },

    commit(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { group: name, partition, offset } = msg.body ?? {}
      const group = ctx.state.offsets[name]
      if (!group) return ctx.fail('UNKNOWN_GROUP', { group: name })
      if (partition === undefined) group.committed = { ...group.positions }
      else if (!(offset >= 0 && offset <= logOf(ctx, partition).next))
        return ctx.fail('OFFSET_OUT_OF_RANGE', { partition, offset })
      else group.committed[partition] = offset
      report(ctx)
      return { ok: true }
    },
  },

  private: {
    /** Registers a group from the oldest retained messages, and gives it every partition. */
    assignPartitions(/** @type {string} */ group, /** @type {Ctx} */ ctx) {
      const all = partitions(ctx)
      if (!ctx.state.offsets[group]) {
        const start = Object.fromEntries(all.map(p => [p, firstOffset(ctx, p)]))
        ctx.state.offsets[group] = { partitions: all, positions: start, committed: { ...start } }
      }
      return all
    },

    /** Keeps only the latest message per key in a partition. */
    compact(/** @type {number} */ p, /** @type {Ctx} */ ctx) {
      const seen = new Set()
      const { messages } = logOf(ctx, p)
      for (let i = messages.length - 1; i >= 0; i--) {
        const { key } = messages[i]
        if (key === null) continue
        if (seen.has(key)) drop(ctx, p, i)
        else seen.add(key)
      }
    },

    /** Drops messages older than the retention time, then the oldest over the retention size. */
    trimRetention(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const { retentionTime, retentionSize } = ctx.props
      for (const p of partitions(ctx)) {
        const { messages } = logOf(ctx, p)
        while (messages.length && messages[0].at + retentionTime <= ctx.now) drop(ctx, p, 0)
      }
      while (ctx.state.bytes > retentionSize) {
        const heads = partitions(ctx).filter(p => logOf(ctx, p).messages.length)
        const p = heads.reduce((a, b) =>
          logOf(ctx, b).messages[0].at < logOf(ctx, a).messages[0].at ? b : a
        )
        drop(ctx, p, 0)
      }
    },
  },
}
