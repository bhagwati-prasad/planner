// @ts-check
// The scheduler adapter contract (eng §6): setTimeout and clearTimeout, with timers running in
// the order they are due. `settle` lets the implementation run: a fake runs its timers, a real
// one waits for a timer of its own. Against real time, a timer counts its delay from the moment
// it is created, and a busy machine can pause between two calls; so the timer due sooner is also
// created first, and due times are tens of milliseconds apart. The fake scheduler's own tests
// check that a timer created later but due sooner runs first.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * @typedef {object} Scheduler
 * @property {(fn: () => void, ms: number) => unknown} setTimeout
 * @property {(handle: unknown) => void} clearTimeout
 */

/**
 * @param {string} name
 * @param {() => { scheduler: Scheduler, settle: () => Promise<void> | void }} make
 */
export function schedulerContract(name, make) {
  describe(`scheduler contract: ${name}`, () => {
    it('runs timers once they are due, in the order they fall due', async () => {
      const { scheduler, settle } = make()
      /** @type {string[]} */
      const ran = []
      scheduler.setTimeout(() => ran.push('sooner'), 0)
      scheduler.setTimeout(() => ran.push('later'), 25)
      await settle()
      assert.deepEqual(ran, ['sooner', 'later'])
    })

    it('never runs a cleared timer', async () => {
      const { scheduler, settle } = make()
      /** @type {string[]} */
      const ran = []
      const handle = scheduler.setTimeout(() => ran.push('cleared'), 0)
      scheduler.setTimeout(() => ran.push('kept'), 25)
      scheduler.clearTimeout(handle)
      await settle()
      assert.deepEqual(ran, ['kept'])
    })
  })
}
