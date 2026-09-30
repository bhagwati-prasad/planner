// @ts-check
// The benchmark runner (task 0207): `npm run bench` runs every tools/bench/*.bench.js and fails
// when a measure is over its eng §15 budget.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { overBudget } from '../bench/run.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

describe('benchmark runner', () => {
  it('fails a measure over its budget and passes one within it', () => {
    assert.deepEqual(
      overBudget([
        { name: 'pan: 95th percentile frame', value: 12.4, unit: 'ms', budget: 16 },
        { name: 'zoom: 95th percentile frame', value: 16, unit: 'ms', budget: 16 },
        { name: 'drag: 95th percentile frame', value: 17.25, unit: 'ms', budget: 16 },
      ]),
      ['drag: 95th percentile frame is 17.3 ms, over its 16 ms budget']
    )
  })

  it('fails a throughput measure under its budget and passes one at or above it', () => {
    assert.deepEqual(
      overBudget([
        {
          name: 'kernel: simple events',
          value: 150_000,
          unit: 'events/s',
          budget: 200_000,
          better: 'higher',
        },
        {
          name: 'kernel: at budget',
          value: 200_000,
          unit: 'events/s',
          budget: 200_000,
          better: 'higher',
        },
        { name: 'kernel: fast', value: 5e6, unit: 'events/s', budget: 200_000, better: 'higher' },
      ]),
      ['kernel: simple events is 150000 events/s, under its 200000 events/s budget']
    )
    assert.equal(
      overBudget([
        { name: 'kernel', value: Number.NaN, unit: 'events/s', budget: 1, better: 'higher' },
      ]).length,
      1
    )
  })

  it('treats a measure that is not a number as over its budget', () => {
    assert.equal(overBudget([{ name: 'pan', value: Number.NaN, unit: 'ms', budget: 16 }]).length, 1)
  })

  it('is what npm run bench runs', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.bench, 'node tools/bench/run.js')
  })

  it('finds benchmarks that each export a bench function', async () => {
    const dir = join(ROOT, 'tools/bench')
    const files = readdirSync(dir).filter(f => f.endsWith('.bench.js'))
    assert.ok(files.includes('graph-pan.bench.js'), files.join(', '))
    assert.ok(files.includes('kernel.bench.js'), files.join(', '))
    for (const file of files) {
      const mod = await import(pathToFileURL(join(dir, file)).href)
      assert.equal(typeof mod.bench, 'function', `${file} exports bench`)
    }
  })
})
