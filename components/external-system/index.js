// @ts-check
/**
 * The starter external stub (spec §9): a dependency outside the modelled architecture. It accepts
 * up to its capacity of calls each second and refuses the rest, answers after its latency, and
 * fails at its error rate.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

export default {
  public: {
    /** Answers a call, unless it is over capacity or fails. */
    async call(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const second = Math.floor(ctx.now / 1000)
      const used = state.window.second === second ? state.window.used : 0
      if (used >= props.capacity) return ctx.fail('OVERLOADED', { capacity: props.capacity })
      state.window = { second, used: used + 1 }
      await ctx.spend(ctx.sample(props.latency))
      if (ctx.random() < props.errorRate) return ctx.fail('UNAVAILABLE', {})
      return null
    },
  },
}
