// @ts-check
// Injected adapters (task 0103, eng §6): ids, time and randomness come from adapters passed in
// at startup, so ids are unique and sorted, and reproducible under the fakes.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeClock, createRandom } from '../../../tools/testing/index.js'
import { createCore, createUlidFactory, ulidTime } from '../src/index.js'
import { createStrata } from '../../facade/src/index.js'

const T0 = Date.UTC(2026, 8, 26, 9)

describe('ULID generator', () => {
  it('10,000 ULIDs generated in one millisecond are unique and sorted', () => {
    const clock = createFakeClock({ start: T0 })
    const next = createUlidFactory({ now: clock.now, random: createRandom(1).bytes })
    const ids = Array.from({ length: 10_000 }, () => next())
    assert.equal(new Set(ids).size, 10_000)
    assert.deepEqual([...ids].sort(), ids)
    assert.ok(ids.every(id => ulidTime(id) === T0))
  })

  it('with the fake clock and a seeded PRNG, ULIDs are reproducible', () => {
    const run = () => {
      const clock = createFakeClock({ start: T0 })
      const next = createUlidFactory({ now: clock.now, random: createRandom(9).bytes })
      const ids = [next(), next()]
      clock.advance(5)
      ids.push(next())
      return ids
    }
    const first = run()
    assert.deepEqual(run(), first)
    assert.equal(ulidTime(first[2]), T0 + 5)
  })
})

describe('adapters at startup', () => {
  it('createCore and createStrata refuse to start without a clock', () => {
    assert.throws(
      () => createCore(),
      /** @param {any} e */ e => e.code === 'E_ADAPTER_MISSING' && /clock/.test(e.message)
    )
    assert.throws(
      () => createStrata(),
      /** @param {any} e */ e => e.code === 'E_ADAPTER_MISSING' && /clock/.test(e.message)
    )
    assert.throws(
      () => createUlidFactory(/** @type {any} */ ({})),
      /** @param {any} e */ e => e.code === 'E_ADAPTER_MISSING'
    )
  })
})
