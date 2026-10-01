// @ts-check
/**
 * The starter object storage (spec §9). Objects live in typed state by key, with their body,
 * size and storage class. Each key prefix, the key up to its last '/', serves requestRateLimit
 * requests a second and throttles the rest. A request takes the first-byte latency, and a put or
 * get also the transfer of its object at the throughput. A request fails at the rate the
 * availability leaves. Lifecycle rules such as "archive after 30d" move each object to another
 * storage class, or expire it, that long after it was put; an archived object cannot be read.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

/** Lifecycle actions, by the word that names them. */
const ACTIONS = Object.freeze({
  'infrequent-access': 'infrequent-access',
  archive: 'archive',
  expire: 'expire',
  delete: 'expire',
})
/** Milliseconds in each duration unit a lifecycle rule may use. */
const UNITS = Object.freeze({ ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 })

/**
 * A lifecycle rule as { action, afterMs }, or null when it is not one.
 * @param {string} rule  such as 'archive after 30d'
 */
function parseRule(rule) {
  const match = /^\s*([a-z-]+)\s+after\s+(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)\s*$/i.exec(rule)
  const action = match && ACTIONS[/** @type {keyof typeof ACTIONS} */ (match[1].toLowerCase())]
  if (!match || !action) return null
  return { action, afterMs: Number(match[2]) * UNITS[/** @type {keyof typeof UNITS} */ (match[3])] }
}

/** The prefix a key belongs to: everything before its last '/'. @param {string} key */
const prefixOf = key => key.slice(0, Math.max(0, key.lastIndexOf('/')))

/**
 * Admits a request on its prefix and checks availability: null when it may go on, or the
 * failure to answer with.
 * @param {Msg} msg @param {Ctx} ctx @param {string} prefix
 */
function admit(msg, ctx, prefix) {
  if (!ctx.call('throttle', { prefix })) return ctx.fail('THROTTLED', { prefix })
  if (ctx.random() >= ctx.props.availability) return ctx.fail('UNAVAILABLE', {})
  return null
}

/** How long a request takes: the first byte, then `bytes` at the throughput, in ms. @param {Ctx} ctx @param {number} bytes */
const transfer = (ctx, bytes) =>
  ctx.sample(ctx.props.firstByteLatency) +
  (ctx.props.throughput > 0 ? (bytes / (ctx.props.throughput * 1e6)) * 1000 : 0)

/** Reports the bytes stored. @param {Ctx} ctx */
const reportStored = ctx => ctx.metric('bytesStored', ctx.state.stored)

/** Takes an object out. @param {Ctx} ctx @param {string} key */
function remove(ctx, key) {
  const object = ctx.state.objects[key]
  if (!object) return
  ctx.state.stored -= object.size
  delete ctx.state.objects[key]
  reportStored(ctx)
}

export default {
  init(/** @type {Ctx} */ ctx) {
    for (const rule of ctx.props.lifecycleRules)
      if (!parseRule(rule))
        ctx.log(
          'warn',
          `Lifecycle rule '${rule}' is not "<infrequent-access|archive|expire> after <n><ms|s|m|h|d>"`
        )
  },

  public: {
    /** Stores an object, and schedules its lifecycle. */
    async put(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { key, body = null, storageClass } = msg.body ?? {}
      const refused = admit(msg, ctx, prefixOf(String(key)))
      if (refused) return refused
      const { props, state } = ctx
      const size = msg.sizeBytes || props.objectSize
      remove(ctx, key)
      state.objects[key] = {
        body,
        size,
        storageClass: storageClass ?? props.storageClass,
        at: ctx.now,
      }
      state.stored += size
      reportStored(ctx)
      ctx.metric('puts', 1)
      for (const rule of props.lifecycleRules) {
        const parsed = parseRule(rule)
        if (parsed)
          ctx.schedule(parsed.afterMs, 'lifecycle', { key, at: ctx.now, action: parsed.action })
      }
      await ctx.spend(transfer(ctx, size))
      return { key, size }
    },

    /** An object's body. */
    async get(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const key = String(msg.body?.key)
      const refused = admit(msg, ctx, prefixOf(key))
      if (refused) return refused
      ctx.metric('gets', 1)
      const object = ctx.state.objects[key]
      if (!object || object.storageClass === 'archive') {
        await ctx.spend(transfer(ctx, 0))
        return object ? ctx.fail('ARCHIVED', { key }) : ctx.fail('NO_SUCH_KEY', { key })
      }
      ctx.metric('egress', object.size / 1e9)
      await ctx.spend(transfer(ctx, object.size))
      return object.body
    },

    /** Removes an object. */
    async delete(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const key = String(msg.body?.key)
      const refused = admit(msg, ctx, prefixOf(key))
      if (refused) return refused
      remove(ctx, key)
      await ctx.spend(transfer(ctx, 0))
      return null
    },

    /** The objects under a prefix, by key. */
    async list(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const prefix = String(msg.body?.prefix ?? '')
      const refused = admit(msg, ctx, prefixOf(prefix))
      if (refused) return refused
      const found = Object.entries(ctx.state.objects)
        .filter(([key]) => key.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, o]) => ({ key, size: o.size, storageClass: o.storageClass }))
      await ctx.spend(transfer(ctx, 0))
      return found
    },
  },

  private: {
    /** Admits a request within its prefix's requestRateLimit this second; false when throttled. */
    throttle(/** @type {{ prefix: string }} */ { prefix }, /** @type {Ctx} */ ctx) {
      const second = Math.floor(ctx.now / 1000)
      const window = ctx.state.windows[prefix]
      const used = window?.second === second ? window.used : 0
      if (used >= ctx.props.requestRateLimit) {
        ctx.metric('throttles', 1)
        return false
      }
      ctx.state.windows[prefix] = { second, used: used + 1 }
      return true
    },

    /** Applies a lifecycle action to an object, if it is still the one put then. */
    applyLifecycle(
      /** @type {{ key: string, at: number, action: string }} */ { key, at, action },
      /** @type {Ctx} */ ctx
    ) {
      const object = ctx.state.objects[key]
      if (object?.at !== at) return false
      if (action === 'expire') remove(ctx, key)
      else object.storageClass = action
      return true
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'lifecycle') ctx.call('applyLifecycle', data)
  },
}
