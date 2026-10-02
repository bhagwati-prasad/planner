// @ts-check
/**
 * The starter third-party API (spec §9): a paid API outside the modelled architecture. It accepts
 * up to its rate limit each second and its daily quota each day, answering the rest with 429.
 * Each call it accepts costs pricePerCall. It answers after its latency, or gives up at its
 * timeout; it is unavailable at the rate its SLA leaves and throughout its outage windows, and
 * otherwise fails at its error rate.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

const MINUTE = 60_000
const DAY = 86_400_000
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * Whether `ms` falls in an outage window such as 'Sun 02:00-03:00 UTC', or '02:00-03:00' every
 * day. The Unix epoch, 1 January 1970, was a Thursday.
 * @param {string} window @param {number} ms
 */
function inWindow(window, ms) {
  const match =
    /^\s*(?:([a-z]{3})[a-z]*\s+)?(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(?:utc)?\s*$/i.exec(
      window
    )
  if (!match) return false
  const day = Math.floor(ms / DAY)
  if (match[1] && WEEKDAYS.indexOf(match[1].toLowerCase()) !== (day + 4) % 7) return false
  const minute = (ms - day * DAY) / MINUTE
  const from = Number(match[2]) * 60 + Number(match[3])
  const to = Number(match[4]) * 60 + Number(match[5])
  return from <= to ? minute >= from && minute < to : minute >= from || minute < to
}

export default {
  public: {
    /** Answers a call within its limits. */
    async call(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
      const { props } = ctx
      ctx.metric('calls', 1)
      const refused = ctx.call('throttle')
      if (refused) {
        ctx.metric('tooManyRequests', 1)
        return ctx.fail(refused.code, refused.details)
      }
      ctx.metric('cost', props.pricePerCall)
      const latency = ctx.sample(props.latency)
      if (props.timeout > 0 && latency > props.timeout) {
        await ctx.spend(props.timeout)
        ctx.metric('errors', 1)
        return ctx.fail('TIMEOUT', { timeoutMs: props.timeout })
      }
      await ctx.spend(latency)
      const outage = props.outageWindows.some((/** @type {string} */ w) => inWindow(w, ctx.now))
      if (outage || ctx.random() >= props.slaAvailability) {
        ctx.metric('errors', 1)
        return ctx.fail('UNAVAILABLE', { status: 503 })
      }
      if (ctx.random() < props.errorRate) {
        ctx.metric('errors', 1)
        return ctx.fail('ERROR', { status: 500 })
      }
      return { status: 200 }
    },
  },

  private: {
    /** Counts a call against the rate limit this second and the quota today; why it is refused, if it is. */
    throttle(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const second = Math.floor(ctx.now / 1000)
      const day = Math.floor(ctx.now / DAY)
      const w = state.windows
      const inSecond = w.second === second ? w.inSecond : 0
      const inDay = w.day === day ? w.inDay : 0
      if (inSecond >= props.rateLimit)
        return { code: 'TOO_MANY_REQUESTS', details: { status: 429, limit: props.rateLimit } }
      if (props.dailyQuota !== undefined && inDay >= props.dailyQuota)
        return { code: 'QUOTA_EXCEEDED', details: { status: 429, quota: props.dailyQuota } }
      state.windows = { second, inSecond: inSecond + 1, day, inDay: inDay + 1 }
      return null
    },
  },
}
