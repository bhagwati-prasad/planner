// @ts-check
// A fake clock for tests (eng §18): time moves only when a test moves it.

/**
 * @typedef {object} FakeClock
 * @property {() => number} now   current time in milliseconds
 * @property {(ms: number) => number} advance  moves forward by `ms`; returns the new time
 * @property {(ms: number) => void} set   moves to `ms`, which must not be in the past
 */

/**
 * @param {{ start?: number }} [options]
 * @returns {FakeClock}
 */
export function createFakeClock({ start = 0 } = {}) {
  let time = start
  return {
    now: () => time,
    advance(ms) {
      if (!(ms >= 0)) throw new RangeError(`A fake clock only moves forward (advance(${ms}))`)
      time += ms
      return time
    },
    set(ms) {
      if (ms < time) throw new RangeError(`A fake clock only moves forward (set(${ms}) at ${time})`)
      time = ms
    },
  }
}
