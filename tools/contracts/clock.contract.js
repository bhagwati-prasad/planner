// @ts-check
// The clock adapter contract (eng §6, §8): a function returning the current time as integer
// epoch milliseconds, UTC, that never goes backwards.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * @param {string} name
 * @param {() => { now: () => number, tick?: () => void }} make  a fresh clock; `tick` moves a fake one on
 */
export function clockContract(name, make) {
  describe(`clock contract: ${name}`, () => {
    it('returns integer epoch milliseconds', () => {
      const { now } = make()
      const t = now()
      assert.ok(Number.isSafeInteger(t) && t >= 0, `${t} is a non-negative integer`)
    })

    it('never goes backwards', () => {
      const { now, tick } = make()
      let last = now()
      for (let i = 0; i < 1000; i++) {
        tick?.()
        const t = now()
        assert.ok(t >= last, `${t} after ${last}`)
        last = t
      }
    })
  })
}
