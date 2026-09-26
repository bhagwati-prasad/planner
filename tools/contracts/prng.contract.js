// @ts-check
// The seeded PRNG adapter contract (eng §6, §13): the same seed always gives the same stream,
// on every engine.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * @typedef {object} Prng
 * @property {() => number} nextU32   an integer in [0, 2^32)
 * @property {() => number} next      a float in [0, 1)
 * @property {(n: number) => Uint8Array} bytes
 */

/**
 * @param {string} name
 * @param {(seed: number) => Prng} make
 */
export function prngContract(name, make) {
  describe(`PRNG contract: ${name}`, () => {
    it('gives the same stream for the same seed and a different one for another seed', () => {
      const take = (/** @type {Prng} */ p) => Array.from({ length: 50 }, () => p.nextU32())
      assert.deepEqual(take(make(42)), take(make(42)))
      assert.notDeepEqual(take(make(42)), take(make(43)))
    })

    it('keeps values in range', () => {
      const p = make(7)
      for (let i = 0; i < 1000; i++) {
        const u = p.nextU32()
        assert.ok(Number.isInteger(u) && u >= 0 && u < 2 ** 32, `${u}`)
        const f = p.next()
        assert.ok(f >= 0 && f < 1, `${f}`)
      }
    })

    it('fills byte arrays of the requested length', () => {
      const bytes = make(3).bytes(33)
      assert.ok(bytes instanceof Uint8Array)
      assert.equal(bytes.length, 33)
    })
  })
}
