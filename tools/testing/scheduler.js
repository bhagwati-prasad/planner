// @ts-check
// A fake scheduler for tests (eng §18): timers run in time order when the test says so, moving
// the fake clock, with no real waiting. Timers due at the same time run in the order they were set.
import { createFakeClock } from './clock.js'

/**
 * @typedef {object} FakeScheduler
 * @property {(fn: Function, ms?: number, ...args: unknown[]) => number} setTimeout
 * @property {(id: number) => void} clearTimeout
 * @property {(fn: Function, ms: number, ...args: unknown[]) => number} setInterval
 * @property {(id: number) => void} clearInterval
 * @property {() => number} pending   timers waiting to run
 * @property {() => boolean} runNext  runs the earliest timer; false when there is none
 * @property {(ms: number) => void} advance  moves time forward, running every timer due
 * @property {(options?: { limit?: number }) => void} runAll  runs timers until none is left
 * @property {import('./clock.js').FakeClock} clock
 */

/**
 * @param {{ clock?: import('./clock.js').FakeClock }} [options]
 * @returns {FakeScheduler}
 */
export function createFakeScheduler({ clock = createFakeClock() } = {}) {
  /** @type {Map<number, { at: number, seq: number, fn: Function, args: unknown[], every: number|null }>} */
  const timers = new Map()
  let nextId = 1
  let seq = 0

  const add = (fn, ms, args, every) => {
    const id = nextId++
    timers.set(id, { at: clock.now() + Math.max(0, ms || 0), seq: seq++, fn, args, every })
    return id
  }
  const earliest = () => {
    let best = null
    for (const [id, t] of timers)
      if (!best || t.at < best[1].at || (t.at === best[1].at && t.seq < best[1].seq)) best = [id, t]
    return best
  }

  /** @type {FakeScheduler} */
  const scheduler = {
    clock,
    setTimeout: (fn, ms = 0, ...args) => add(fn, ms, args, null),
    clearTimeout: id => {
      timers.delete(id)
    },
    setInterval: (fn, ms, ...args) => add(fn, Math.max(1, ms), args, Math.max(1, ms)),
    clearInterval: id => {
      timers.delete(id)
    },
    pending: () => timers.size,
    runNext() {
      const next = earliest()
      if (!next) return false
      const [id, timer] = next
      clock.set(timer.at)
      if (timer.every === null) timers.delete(id)
      else timers.set(id, { ...timer, at: timer.at + timer.every, seq: seq++ })
      timer.fn(...timer.args)
      return true
    },
    advance(ms) {
      const target = clock.now() + ms
      for (let next = earliest(); next && next[1].at <= target; next = earliest())
        scheduler.runNext()
      clock.set(target)
    },
    runAll({ limit = 10_000 } = {}) {
      for (let count = 0; scheduler.runNext();) {
        if (++count >= limit && timers.size) {
          throw new Error(
            `runAll ran more than ${limit} timers; an interval may repeat forever. Clear it, or use advance(ms) instead.`
          )
        }
      }
    },
  }
  return scheduler
}
