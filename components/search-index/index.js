// @ts-check
/**
 * The starter search index (spec §9). Documents go through an indexing pipeline at the indexing
 * throughput, and become searchable at the first refresh after they are indexed, every
 * refreshInterval. Until then they fill the indexing buffer, a tenth of the heap as in
 * Elasticsearch; a document that would overflow it is rejected. A search matches documents that
 * contain every term of its query, best first, and waits for the slowest of its shards. Deletes
 * take effect at a refresh too, but keep their bytes in the index until a merge, every tenth
 * refresh.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

/** The share of the heap that buffers documents not yet searchable. */
const BUFFER_SHARE = 0.1
/** Refreshes between merges. */
const MERGE_EVERY = 10

/** The lower-case words of a text. @param {string} text */
const words = text =>
  String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Every string inside a value, at any depth. @param {unknown} value @returns {string[]} */
const strings = value =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(strings)
      : []

/** Reports the index's size. @param {Ctx} ctx */
const reportSize = ctx => ctx.metric('indexSize', ctx.state.size)

export default {
  init(/** @type {Ctx} */ ctx) {
    ctx.state.size = ctx.props.indexSize
    ctx.schedule(ctx.props.refreshInterval, 'refresh')
  },

  public: {
    /** Queues a document for indexing, unless the indexing buffer is full. */
    index(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const { id, doc = {} } = msg.body ?? {}
      const size = msg.sizeBytes || JSON.stringify(doc).length
      const limit = BUFFER_SHARE * props.heap
      if (state.buffered + size > limit) {
        ctx.metric('rejections', 1)
        return ctx.fail('REJECTED', { buffered: state.buffered, limit })
      }
      const readyAt = Math.max(ctx.now, state.indexedUntil) + 1000 / props.indexingThroughput
      state.indexedUntil = readyAt
      state.pending.push({ kind: 'index', id, doc, size, arrivedAt: ctx.now, readyAt })
      state.buffered += size
      return { id }
    },

    /** The documents that contain every term of a query, best first. */
    async search(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const terms = words(msg.body?.query ?? '')
      ctx.metric('queries', 1)
      const hits = Object.entries(ctx.state.docs)
        .map(([id, { doc }]) => {
          const found = strings(doc).flatMap(words)
          const counts = terms.map(t => found.filter(w => w === t).length)
          return {
            id,
            doc,
            score: counts.every(n => n > 0) ? counts.reduce((a, b) => a + b, 0) : 0,
          }
        })
        .filter(hit => hit.score > 0)
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const shards = Array.from({ length: ctx.props.shards }, () =>
        ctx.sample(ctx.props.queryLatency)
      )
      await ctx.spend(Math.max(...shards))
      return hits.map(({ id, doc }) => ({ id, doc }))
    },

    /** Queues a document's deletion, behind what is already queued. */
    delete(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { state } = ctx
      const readyAt = Math.max(ctx.now, state.indexedUntil)
      state.pending.push({ kind: 'delete', id: msg.body?.id, arrivedAt: ctx.now, readyAt })
      return null
    },
  },

  private: {
    /**
     * Makes searchable every operation indexed by now, in order, and reports the indexing lag of
     * the oldest document it made searchable; merges every tenth time.
     */
    refresh(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const { state } = ctx
      const sizeBefore = state.size
      let oldest = Infinity
      while (state.pending.length && state.pending[0].readyAt <= ctx.now) {
        const op = state.pending.shift()
        const old = state.docs[op.id]
        if (old) state.deleted += old.size
        if (op.kind === 'index') {
          state.docs[op.id] = { doc: op.doc, size: op.size }
          state.size += op.size
          state.buffered -= op.size
          oldest = Math.min(oldest, op.arrivedAt)
        } else delete state.docs[op.id]
      }
      if (oldest < Infinity) ctx.metric('indexingLag', (ctx.now - oldest) / 1000)
      if (++state.refreshes % MERGE_EVERY === 0 && state.deleted > 0) ctx.call('merge')
      else if (state.size !== sizeBefore) reportSize(ctx)
    },

    /** Reclaims the bytes of deleted documents. */
    merge(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      ctx.state.size -= ctx.state.deleted
      ctx.state.deleted = 0
      reportSize(ctx)
    },
  },

  onTimer(/** @type {{ name: string }} */ { name }, /** @type {Ctx} */ ctx) {
    if (name !== 'refresh') return
    ctx.call('refresh')
    ctx.schedule(ctx.props.refreshInterval, 'refresh')
  },
}
