// @ts-check
/**
 * The starter scheduler (spec §9). It runs on a five-field cron expression (minute, hour, day of
 * month, month, day of week), in simulated time from the Unix epoch in UTC, each run moved later
 * by up to its jitter. A run sends its job on `out`, when it is connected, and lasts the job
 * duration. When a schedule comes while a run is still going, the concurrency policy decides:
 * allow starts another, forbid skips this one, and replace drops the one going. While paused it
 * misses its schedules; on resume, with catchUp, it runs once for them.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
/** The ranges of the five fields. */
const FIELDS = /** @type {const} */ ([
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
])
/** How many steps nextRun takes before it decides a cron expression never matches. */
const MAX_STEPS = 100_000

/**
 * The values a cron field allows, or null when it is malformed: `*`, `*\/n`, `a`, `a-b`, `a-b/n`
 * and lists of them. A day of week of 7 is Sunday, as 0 is.
 * @param {string} text @param {readonly [number, number]} range @param {boolean} weekday
 */
function parseField(text, [lo, hi], weekday) {
  const allowed = new Set()
  for (const part of text.split(',')) {
    const match = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!match) return null
    const from = match[1] === '*' ? lo : Number(match[2])
    const to =
      match[1] === '*' ? hi : match[3] !== undefined ? Number(match[3]) : match[4] ? hi : from
    const step = match[4] ? Number(match[4]) : 1
    if (from < lo || to > (weekday ? 7 : hi) || from > to || step < 1) return null
    for (let v = from; v <= to; v += step) allowed.add(weekday && v === 7 ? 0 : v)
  }
  return allowed
}

/** A cron expression's fields, or null when it is malformed. @param {string} cron */
function parseCron(cron) {
  const parts = String(cron).trim().split(/\s+/)
  if (parts.length !== 5) return null
  const sets = parts.map((p, i) => parseField(p, FIELDS[i], i === 4))
  if (sets.some(s => s === null)) return null
  return {
    sets: /** @type {Set<number>[]} */ (sets),
    anyDay: parts[2] === '*',
    anyWeekday: parts[4] === '*',
  }
}

/**
 * The month and day of a day counted from the Unix epoch, by Howard Hinnant's civil_from_days, in
 * integer arithmetic alone.
 * @param {number} days
 */
function civil(days) {
  const z = days + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  return { day: doy - Math.floor((153 * mp + 2) / 5) + 1, month: mp < 10 ? mp + 3 : mp - 9 }
}

/**
 * The first minute at or after `fromMs` that the cron expression matches, or null when none does
 * soon. When both day fields are restricted, either may match, as in cron.
 * @param {NonNullable<ReturnType<typeof parseCron>>} cron @param {number} fromMs
 */
function nextRun(cron, fromMs) {
  const [minutes, hours, days, months, weekdays] = cron.sets
  let t = Math.ceil(fromMs / MINUTE) * MINUTE
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    const dayNumber = Math.floor(t / DAY)
    const { day, month } = civil(dayNumber)
    const dayOk = days.has(day)
    const weekdayOk = weekdays.has((dayNumber + 4) % 7)
    const dateOk = cron.anyDay || cron.anyWeekday ? dayOk && weekdayOk : dayOk || weekdayOk
    if (!months.has(month) || !dateOk) {
      t = (dayNumber + 1) * DAY
      continue
    }
    const minuteOfDay = (t - dayNumber * DAY) / MINUTE
    const hour = Math.floor(minuteOfDay / 60)
    if (!hours.has(hour)) {
      t = dayNumber * DAY + (hour + 1) * HOUR
      continue
    }
    if (!minutes.has(minuteOfDay % 60)) {
      t += MINUTE
      continue
    }
    return t
  }
  return null
}

/** A draw of the jitter, in ms. @param {Ctx} ctx */
const jitter = ctx => (ctx.props.jitter > 0 ? ctx.random() * ctx.props.jitter : 0)

/**
 * Sets the timer for the first schedule at or after `fromMs`.
 * @param {Ctx} ctx @param {number} fromMs
 */
function plan(ctx, fromMs) {
  const cron = parseCron(ctx.props.cron)
  const at = cron && nextRun(cron, fromMs)
  ctx.state.nextAt = at ?? -1
  if (at !== null && at !== undefined)
    ctx.schedule(Math.max(0, at - ctx.now + jitter(ctx)), 'tick', { at })
}

export default {
  init(/** @type {Ctx} */ ctx) {
    if (!parseCron(ctx.props.cron))
      ctx.log(
        'warn',
        `'${ctx.props.cron}' is not a five-field cron expression; the scheduler never runs`
      )
    plan(ctx, ctx.now)
  },

  public: {
    /** Runs now, by the concurrency policy, unless paused. */
    trigger(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
      if (ctx.state.paused) return ctx.fail('PAUSED', {})
      return { run: ctx.call('dispatch', { scheduledAt: ctx.now }) }
    },

    /** Stops running on schedule; schedules until resume are missed. */
    pause(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
      ctx.state.paused = true
      return null
    },

    /** Runs on schedule again, first once for the schedules it missed when catchUp is set. */
    resume(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
      const { state } = ctx
      state.paused = false
      if (ctx.props.catchUp && state.missed > 0) ctx.call('dispatch', { scheduledAt: ctx.now })
      state.missed = 0
      return null
    },
  },

  private: {
    /** A schedule comes: it runs, or is missed while paused; then the next is planned. */
    tick(/** @type {{ at: number }} */ { at }, /** @type {Ctx} */ ctx) {
      if (ctx.state.paused) {
        ctx.state.missed++
        ctx.metric('missedRuns', 1)
      } else ctx.call('dispatch', { scheduledAt: at })
      plan(ctx, at + 1)
    },

    /** Starts a run by the concurrency policy; its number, or null when forbidden. */
    dispatch(/** @type {{ scheduledAt: number }} */ { scheduledAt }, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      if (state.active.length) {
        ctx.metric('overlaps', 1)
        if (props.concurrencyPolicy === 'forbid') {
          ctx.metric('missedRuns', 1)
          return null
        }
        if (props.concurrencyPolicy === 'replace') state.active = []
      }
      const run = ++state.runs
      state.active.push(run)
      ctx.metric('runs', 1)
      if (ctx.targets('out').length) ctx.emit('out', null, { scheduledAt, run })
      const duration = ctx.sample(props.jobDuration)
      ctx.schedule(duration, 'done', { run, duration })
      return run
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'tick') return ctx.call('tick', data)
    if (name !== 'done') return
    const at = ctx.state.active.indexOf(data.run)
    if (at < 0) return
    ctx.state.active.splice(at, 1)
    ctx.metric('duration', data.duration)
  },
}
