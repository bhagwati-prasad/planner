// @ts-check
/**
 * The starter serverless function (spec §9). Each invocation runs on a warm instance that is
 * idle, the one that finished last, or on a new one, which cold-starts. A warm instance
 * cold-starts too, at coldStartProbability, as platforms recycle instances. After the cold start
 * the execution runs for its execution time, stopped at the timeout, then makes the function's
 * calls in order. Its instance stays warm for keepWarmIdle, then is reclaimed; one that timed
 * out is not kept. Invocations over the concurrency limit, reservedConcurrency when set and
 * maxConcurrency otherwise, are throttled. Each invocation costs pricePerInvocation plus
 * pricePerGbSecond for its memory over its billed time: its cold start, its execution and its
 * calls, in whole ms.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

export default {
  public: {
    /** Runs the function once, and answers with its calls' replies, by call. */
    async invoke(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const limit = props.reservedConcurrency > 0 ? props.reservedConcurrency : props.maxConcurrency
      if (state.running >= limit) {
        ctx.metric('throttles', 1)
        return ctx.fail('THROTTLED', { limit })
      }
      ctx.metric('invocations', 1)
      ctx.metric('concurrentExecutions', ++state.running)
      const started = ctx.now
      let keep = true
      try {
        const warm = state.idle.length > 0
        if (warm) state.idle.pop()
        if (!warm || ctx.random() < props.coldStartProbability)
          await ctx.spend(ctx.call('coldStart'))
        const execution = ctx.sample(props.executionTime)
        if (execution > props.timeout) {
          keep = false
          await ctx.spend(props.timeout)
          return ctx.fail('TIMEOUT', { timeoutMs: props.timeout })
        }
        await ctx.spend(execution)
        /** @type {Record<string, unknown>} */
        const body = {}
        for (const call of props.calls ?? []) {
          const [port, method = null] = String(call).split('.')
          try {
            body[call] = await ctx.send(port, method, msg.body)
          } catch (err) {
            const code = /** @type {any} */ (err)?.code ?? 'FAILED'
            return ctx.fail('DEPENDENCY_FAILED', { port, ...(method ? { method } : {}), code })
          }
        }
        return body
      } finally {
        ctx.metric('concurrentExecutions', --state.running)
        const seconds = Math.ceil(ctx.now - started) / 1000
        ctx.metric(
          'cost',
          props.pricePerInvocation + props.pricePerGbSecond * (props.memory / 1e9) * seconds
        )
        if (keep) {
          state.idle.push(ctx.now)
          ctx.schedule(props.keepWarmIdle, 'reap', { since: ctx.now })
        }
      }
    },
  },

  private: {
    /** Starts a new instance: how long its cold start takes, in ms. */
    coldStart(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      ctx.metric('coldStarts', 1)
      return ctx.sample(ctx.props.coldStartLatency)
    },

    /** Reclaims an instance still idle since `since`, if one is. */
    reap(/** @type {{ since: number }} */ { since }, /** @type {Ctx} */ ctx) {
      const at = ctx.state.idle.indexOf(since)
      if (at >= 0) ctx.state.idle.splice(at, 1)
      return at >= 0
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'reap') ctx.call('reap', data)
  },
}
