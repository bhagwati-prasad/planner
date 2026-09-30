// @ts-check
/**
 * The starter message queue (spec §9): it keeps messages until they expire by retention,
 * applies its overflow policy when full, delivers no faster than its consumers' egress rate,
 * keeps received messages in flight until acknowledged, returns them after the visibility
 * timeout, and dead-letters those received maxReceives times. With a fixed ingress mode it
 * generates messages at its ingress rate.
 */

/** @typedef {any} Msg @typedef {any} Ctx */

/** When the oldest visible message arrived, or Infinity. @param {Ctx} ctx */
const oldest = ctx =>
  ctx.state.messages.reduce(
    (/** @type {number} */ at, /** @type {any} */ m) => Math.min(at, m.enqueuedAt),
    Infinity
  )

/** Reports depth, fill and the oldest message's age in seconds. @param {Ctx} ctx */
function gauges(ctx) {
  const depth = ctx.state.messages.length
  const at = oldest(ctx)
  ctx.metric('depth', depth)
  ctx.metric('fill', depth / ctx.props.capacityMessages)
  ctx.metric('oldestAge', Number.isFinite(at) ? (ctx.now - at) / 1000 : 0)
}

/** Sets the retention timer for the oldest message, unless one is set. @param {Ctx} ctx */
function armExpiry(ctx) {
  const at = oldest(ctx)
  if (ctx.state.expiryArmed || !Number.isFinite(at)) return
  ctx.state.expiryArmed = true
  ctx.schedule(Math.max(0, at + ctx.props.retention - ctx.now), 'expire')
}

/** Whether a message of `size` bytes fits. @param {Ctx} ctx @param {number} size */
const fits = (ctx, size) =>
  ctx.state.messages.length < ctx.props.capacityMessages &&
  ctx.state.bytes + size <= ctx.props.capacityBytes

/** Adds a message at the back. @param {Ctx} ctx @param {any} message */
function enqueue(ctx, message) {
  ctx.state.messages.push(message)
  ctx.state.bytes += message.sizeBytes
  ctx.metric('ingress', 1)
  gauges(ctx)
  armExpiry(ctx)
}

/** Takes the message at `i` out of the queue, as a copy. @param {Ctx} ctx @param {number} i */
function take(ctx, i) {
  const [message] = ctx.state.messages.splice(i, 1)
  ctx.state.bytes -= message.sizeBytes
  return { ...message }
}

/** Lets blocked publishes in while there is space. @param {Ctx} ctx */
function admit(ctx) {
  const { blocked } = ctx.state
  while (blocked.length && fits(ctx, blocked[0].sizeBytes)) enqueue(ctx, { ...blocked.shift() })
}

/**
 * Accepts a message, or applies the overflow policy.
 * @param {Ctx} ctx @param {unknown} body @param {number} size
 */
function accept(ctx, body, size) {
  const { props, state } = ctx
  const dedupId =
    props.deliveryGuarantee === 'exactly-once' ? /** @type {any} */ (body)?.dedupId : undefined
  if (dedupId !== undefined && state.dedup[dedupId])
    return { id: state.dedup[dedupId], duplicate: true }
  if (!fits(ctx, size) && props.overflowPolicy === 'reject') {
    ctx.metric('rejected', 1)
    return ctx.fail('QUEUE_FULL', { capacity: props.capacityMessages })
  }
  const id = String(++state.published)
  if (dedupId !== undefined) state.dedup[dedupId] = id
  const key = /** @type {any} */ (body)?.key ?? null
  const message = { id, body, key, sizeBytes: size, enqueuedAt: ctx.now, receives: 0 }
  if (!fits(ctx, size) && props.overflowPolicy === 'block-producer') {
    state.blocked.push(message)
    return { id, blocked: true }
  }
  while (state.messages.length && !fits(ctx, size)) {
    take(ctx, 0)
    ctx.metric('dropped', 1)
  }
  enqueue(ctx, message)
  return { id }
}

/** How many messages the egress rate allows now. @param {Ctx} ctx */
function budget(ctx) {
  const { props, state } = ctx
  const rate = props.consumers * props.perConsumerRate
  const refill = ((ctx.now - state.tokensAt) / 1000) * rate
  state.tokens = state.tokensAt < 0 ? rate : Math.min(rate, state.tokens + refill)
  state.tokensAt = ctx.now
  return Math.floor(state.tokens)
}

export default {
  init(/** @type {Ctx} */ ctx) {
    if (ctx.props.ingressMode === 'fixed' && ctx.props.ingressRate > 0)
      ctx.schedule(1000 / ctx.props.ingressRate, 'ingress')
  },

  public: {
    publish(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const size = msg.sizeBytes ?? 0
      if (size > ctx.props.maxMessageSize)
        return ctx.fail('MESSAGE_TOO_LARGE', { sizeBytes: size, max: ctx.props.maxMessageSize })
      return accept(ctx, msg.body, size)
    },

    receive(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      ctx.call('expire')
      const max = Math.min(msg.body?.max ?? 1, budget(ctx))
      const perKey = props.ordering === 'per-key'
      const busy = new Set(Object.values(state.inFlight).map((/** @type {any} */ m) => m.key))
      const batch = []
      for (let i = 0; i < state.messages.length && batch.length < max;) {
        const { key } = state.messages[i]
        if (perKey && key !== null && busy.has(key)) {
          i++
          continue
        }
        const message = take(ctx, i)
        message.receives++
        busy.add(key)
        batch.push(message)
      }
      state.tokens -= batch.length
      for (const message of batch) {
        ctx.metric('egress', 1)
        ctx.metric('timeInQueue', ctx.now - message.enqueuedAt)
        if (props.deliveryGuarantee === 'at-most-once') continue
        state.inFlight[message.id] = message
        ctx.schedule(props.visibilityTimeout, 'visibility', {
          id: message.id,
          receives: message.receives,
        })
      }
      if (batch.length) {
        admit(ctx)
        gauges(ctx)
      }
      return batch.map(({ id, body, receives }) => ({ id, body, receives }))
    },

    ack(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const id = msg.body?.id
      if (!ctx.state.inFlight[id]) return ctx.fail('UNKNOWN_MESSAGE', { id })
      delete ctx.state.inFlight[id]
      return { ok: true }
    },

    nack(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const id = msg.body?.id
      if (!ctx.state.inFlight[id]) return ctx.fail('UNKNOWN_MESSAGE', { id })
      ctx.call('redeliver', id)
      return { ok: true }
    },
  },

  private: {
    /** Drops visible messages older than the retention period. */
    expire(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const { messages } = ctx.state
      let expired = 0
      for (let i = messages.length - 1; i >= 0; i--)
        if (messages[i].enqueuedAt + ctx.props.retention <= ctx.now) {
          take(ctx, i)
          expired++
        }
      for (let n = 0; n < expired; n++) ctx.metric('expired', 1)
      if (expired) gauges(ctx)
      return expired
    },

    /** Returns an in-flight message to the front, or dead-letters it after maxReceives. */
    redeliver(/** @type {string} */ id, /** @type {Ctx} */ ctx) {
      const message = { ...ctx.state.inFlight[id] }
      delete ctx.state.inFlight[id]
      if (message.receives >= ctx.props.maxReceives) return ctx.call('sendToDlq', message)
      ctx.state.messages.unshift(message)
      ctx.state.bytes += message.sizeBytes
      gauges(ctx)
      armExpiry(ctx)
    },

    /** Keeps a dead letter, and publishes it to the dead-letter queue when there is one. */
    sendToDlq(/** @type {any} */ message, /** @type {Ctx} */ ctx) {
      ctx.state.deadLetters.push(message)
      ctx.metric('sentToDlq', 1)
      if (ctx.props.dlqTarget) ctx.emit('dlq', 'publish', message.body)
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'expire') {
      ctx.state.expiryArmed = false
      ctx.call('expire')
      armExpiry(ctx)
    } else if (name === 'visibility') {
      if (ctx.state.inFlight[data.id]?.receives === data.receives) ctx.call('redeliver', data.id)
    } else if (name === 'ingress') {
      accept(ctx, { generated: ctx.state.published + 1 }, 0)
      ctx.schedule(1000 / ctx.props.ingressRate, 'ingress')
    }
  },
}
