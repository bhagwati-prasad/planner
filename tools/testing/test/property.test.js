// @ts-check
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gen, property } from '../index.js'

describe('property()', () => {
  it('passes when the predicate holds for every generated case', () => {
    let runs = 0
    property(
      [gen.int(-100, 100), gen.int(-100, 100)],
      (a, b) => {
        runs++
        return a + b === b + a
      },
      { seed: 1, runs: 150 }
    )
    assert.equal(runs, 150)
  })

  it('reports the seed and a shrunk counterexample when the property fails', () => {
    assert.throws(
      // "Every element is below 100" has one minimal counterexample, [100], whatever the path.
      () =>
        property([gen.array(gen.int(0, 1000), { max: 20 })], list => list.every(x => x < 100), {
          seed: 42,
        }),
      err => {
        assert.match(err.message, /seed 42/)
        assert.match(err.message, /STRATA_SEED=42/)
        assert.match(err.message, /Counterexample \(shrunk in \d+ steps\): \[\[100\]\]/)
        assert.deepEqual(err.counterexample, [[100]])
        assert.equal(err.seed, 42)
        assert.ok(
          JSON.stringify(err.original).length > JSON.stringify(err.counterexample).length,
          'the original was larger'
        )
        return true
      }
    )
  })

  it('treats a thrown assertion as a failure and keeps its message', () => {
    assert.throws(
      () =>
        property(
          [gen.string({ max: 10 })],
          s => {
            assert.ok(!s.includes('x'), 'no x allowed')
          },
          { seed: 3, runs: 500 }
        ),
      err => {
        assert.deepEqual(err.counterexample, ['x'])
        assert.match(err.message, /no x allowed/)
        return true
      }
    )
  })

  it('shrinks through map, tuple and record', () => {
    const even = gen.map(gen.int(0, 10_000), n => n * 2)
    assert.throws(
      () =>
        property(
          [gen.record({ a: even, b: gen.tuple(gen.bool(), gen.int(0, 50)) })],
          ({ a, b }) => a < 500 || !b[0],
          { seed: 5, runs: 500 }
        ),
      err => {
        assert.deepEqual(err.counterexample, [{ a: 500, b: [true, 0] }])
        return true
      }
    )
  })
})
