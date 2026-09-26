// @ts-check
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRandom, gen, sample } from '../index.js'

const model = gen.record({
  name: gen.string({ min: 1, max: 12 }),
  count: gen.int(0, 1000),
  tags: gen.array(gen.oneOf('a', 'b', 'c'), { max: 5 }),
  ratio: gen.float(0, 1),
  on: gen.bool(),
})

describe('seeded generators', () => {
  it('return identical sequences for the same seed and different ones for different seeds', () => {
    const first = sample(model, { seed: 42, count: 50 })
    const again = sample(model, { seed: 42, count: 50 })
    const other = sample(model, { seed: 43, count: 50 })
    assert.deepEqual(first, again)
    assert.notDeepEqual(first, other)
    assert.equal(
      new Set(first.map(v => JSON.stringify(v))).size > 40,
      true,
      'values vary within a sequence'
    )
  })

  it('stay within their bounds', () => {
    for (const v of sample(model, { seed: 7, count: 200 })) {
      assert.ok(v.name.length >= 1 && v.name.length <= 12)
      assert.ok(Number.isInteger(v.count) && v.count >= 0 && v.count <= 1000)
      assert.ok(v.tags.length <= 5 && v.tags.every(t => ['a', 'b', 'c'].includes(t)))
      assert.ok(v.ratio >= 0 && v.ratio < 1)
      assert.equal(typeof v.on, 'boolean')
    }
  })

  it('draw uniform 32-bit integers and floats from a seeded PRNG', () => {
    const a = createRandom(1)
    const b = createRandom(1)
    const xs = Array.from({ length: 1000 }, () => a.float())
    assert.deepEqual(
      xs.slice(0, 10),
      Array.from({ length: 10 }, () => b.float())
    )
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean}`)
    assert.ok(xs.every(x => x >= 0 && x < 1))
  })
})
