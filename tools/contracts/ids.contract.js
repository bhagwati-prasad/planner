// @ts-check
// The id generator contract (eng §8): ULIDs, unique and monotonic, so ids sort in creation
// order even within one millisecond.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * @param {string} name
 * @param {() => () => string} make  a fresh id generator
 */
export function idsContract(name, make) {
  describe(`id generator contract: ${name}`, () => {
    it('returns 26-character Crockford base32 ULIDs', () => {
      const id = make()()
      assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/)
    })

    it('returns unique ids in creation order', () => {
      const next = make()
      const ids = Array.from({ length: 2000 }, () => next())
      assert.equal(new Set(ids).size, ids.length)
      assert.deepEqual([...ids].sort(), ids)
    })
  })
}
