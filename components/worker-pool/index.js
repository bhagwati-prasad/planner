// @ts-check
/**
 * The starter worker pool (spec §9): every poll interval it receives from its source, a queue,
 * as many messages as its free workers and its prefetch allow, up to a batch. Each worker
 * processes one message for the processing time, then hands it to its handler on `out`, whose
 * edge names the method, and acknowledges it. A message whose handler fails is tried again
 * after a backoff that doubles each time, up to maxRetries; then it is poison, and the pool
 * returns it to the queue with nack, whose own policy decides what happens to it.
 */

/** @typedef {any} Ctx */

/** Starts free workers on buffered messages. @param {Ctx} ctx */
function dispatch(ctx) {
  const { state } = ctx
  while (state.busy < ctx.props.consumers && state.buffer.length) {
    const { message, batch } = state.buffer.shift()
    ctx.call('process', { message, attempt: 1, batch })
  }
}

/** Frees a worker, closes its batch when that was the last message, and starts the next. @param {Ctx} ctx @param {number} batch */
function finish(ctx, batch) {
  const open = ctx.state.batches[batch]
  ctx.state.busy--
  if (--open.left === 0) {
    ctx.metric('batchLatency', ctx.now - open.at)
    delete ctx.state.batches[batch]
  }
  dispatch(ctx)
}

export default {
  init(/** @type {Ctx} */ ctx) {
    ctx.schedule(0, 'poll')
  },

  public: {
    status(/** @type {unknown} */ _msg, /** @type {Ctx} */ ctx) {
      const { consumers } = ctx.props
      const { busy, buffer } = ctx.state
      return {
        consumers,
        busy,
        buffered: buffer.length,
        idle: consumers ? (consumers - busy) / consumers : 0,
      }
    },
  },

  private: {
    /** How many messages to receive: free workers plus prefetch, less those buffered, up to a batch. */
    poll(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const { consumers, prefetch, batchSize } = ctx.props
      const { busy, buffer } = ctx.state
      ctx.metric('idle', consumers ? (consumers - busy) / consumers : 0)
      return Math.max(0, Math.min(batchSize, consumers - busy + prefetch - buffer.length))
    },

    /** Puts a worker on a message for the processing time. */
    process(/** @type {any} */ work, /** @type {Ctx} */ ctx) {
      ctx.state.busy++
      ctx.schedule(ctx.sample(ctx.props.processingTime), 'handle', work)
    },

    /** Processes a failed message again after its backoff, which doubles with each attempt. */
    retry(/** @type {any} */ { message, attempt, batch }, /** @type {Ctx} */ ctx) {
      ctx.metric('retries', 1)
      const wait = ctx.props.backoff * 2 ** (attempt - 1) + ctx.sample(ctx.props.processingTime)
      ctx.schedule(wait, 'handle', { message, attempt: attempt + 1, batch })
    },
  },

  async onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'poll') {
      const want = ctx.call('poll')
      ctx.schedule(ctx.props.pollInterval, 'poll')
      if (want === 0) return
      const messages = await ctx.send('source', 'receive', { max: want })
      if (!messages?.length) return
      const batch = ++ctx.state.received
      ctx.state.batches[batch] = { at: ctx.now, left: messages.length }
      for (const message of messages) ctx.state.buffer.push({ message, batch })
      dispatch(ctx)
      return
    }
    if (name !== 'handle') return
    const { message, attempt, batch } = data
    try {
      await ctx.send('out', null, message.body)
    } catch {
      if (attempt <= ctx.props.maxRetries) return ctx.call('retry', data)
      ctx.metric('poisonMessages', 1)
      ctx.emit('source', 'nack', { id: message.id })
      return finish(ctx, batch)
    }
    ctx.emit('source', 'ack', { id: message.id })
    ctx.metric('throughput', 1)
    finish(ctx, batch)
  },
}
