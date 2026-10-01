// @ts-check
// Self-tests of the starter NoSQL / key-value DB (task 0422, spec §9): items in partitions by
// key, a per-partition limit that throttles a hot key's partition alone, hot-key skew for
// requests without a key, read and write latency by consistency over the replicas, stale
// eventual reads, item TTL and storage.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

const constant = (/** @type {number} */ value) => ({ kind: 'constant', value })

/**
 * A database in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} [props]
 */
function database(props = {}) {
  const api = runComponent({ manifest, behaviour, props: { latency: constant(3), ...props } })
  const run = api.runUntil
  api.runUntil = async ms => {
    await run(ms)
    for (const m of api.metrics) covered.metrics.add(m.name)
    for (const s of api.spans)
      if (s.node === 'it' && s.kind === 'public') covered.methods.add(s.method)
    for (const s of api.spans) if (s.node === 'it' && s.code) covered.errors.add(s.code)
  }
  return api
}

/** @param {any} db @param {string} method @param {unknown} body */
const call = (db, method, body, atMs = 0) => db.call(method, body, { atMs })

/** A reply's body, or its error's code. @param {any} reply */
const outcome = reply => (reply.status === 'ok' ? reply.body : reply.error?.code)

/** A metric's values over time, as [ms, value]. @param {any} db @param {string} name */
const series = (db, name) =>
  db.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

describe('NoSQL DB', () => {
  it('throttles a hot key’s partition while the other partitions serve every request', async () => {
    const db = database({ partitions: 4, opsPerPartition: '10/s' })
    const hot = Array.from({ length: 30 }, (_, i) => call(db, 'get', { key: 'hot' }, i * 10))
    const others = Array.from({ length: 12 }, (_, i) => call(db, 'get', { key: `user-${i}` }, 500))
    await db.runUntil(2000)
    assert.deepEqual(
      hot.map(r => r.error?.code ?? r.status),
      [...Array(10).fill('ok'), ...Array(20).fill('THROTTLED')]
    )
    const hotPartition = hot[29].error?.details?.partition
    assert.ok(Number.isInteger(hotPartition))
    for (const r of others)
      if (r.status !== 'ok')
        assert.equal(r.error?.details?.partition, hotPartition, 'only the hot partition throttles')
    assert.ok(
      others.filter(r => r.status === 'ok').length >= 6,
      'the other partitions serve their requests'
    )
    assert.equal(
      series(db, 'throttledOps').length,
      20 + others.filter(r => r.status !== 'ok').length
    )
    assert.equal(Math.max(...series(db, 'partitionOps').map(([, n]) => n)), 10)
  })

  it('puts, gets, deletes and queries items by key, and expires them after their TTL', async () => {
    const db = database({ itemTtl: '10s', itemSize: '4KB' })
    const replies = [
      call(db, 'put', { key: 'order#1', value: { total: 30 } }, 0),
      call(db, 'put', { key: 'order#2', value: { total: 12 } }, 0),
      call(db, 'put', { key: 'user#1', value: { name: 'ada' } }, 0),
      call(db, 'get', { key: 'order#1' }, 100),
      call(db, 'query', { prefix: 'order#' }, 100),
      call(db, 'delete', { key: 'order#2' }, 200),
      call(db, 'get', { key: 'order#2' }, 300),
      call(db, 'get', { key: 'user#1' }, 11_000),
    ]
    await db.runUntil(20_000)
    assert.deepEqual(replies.map(outcome), [
      null,
      null,
      null,
      { total: 30 },
      [
        { key: 'order#1', value: { total: 30 } },
        { key: 'order#2', value: { total: 12 } },
      ],
      null,
      null,
      null,
    ])
    assert.deepEqual(
      series(db, 'storage').map(([, bytes]) => bytes),
      [4000, 8000, 12_000, 8000, 4000, 0],
      'each item takes itemSize, until it is deleted or expires'
    )
  })

  it('answers after the fastest replica when eventual, and after a quorum when strong, whose reads are never stale', async () => {
    /** @param {string} consistency */
    const read = async consistency => {
      const db = database({
        consistency,
        replicationFactor: 3,
        latency: { kind: 'uniform', min: 1, max: 100 },
      })
      call(db, 'put', { key: 'k', value: 'v1' }, 0)
      const write = call(db, 'put', { key: 'k', value: 'v2' }, 1000)
      const reads = Array.from({ length: 20 }, () => call(db, 'get', { key: 'k' }, 1150))
      const soon = Array.from({ length: 20 }, (_, i) => call(db, 'get', { key: 'k' }, 1001 + 5 * i))
      await db.runUntil(5000)
      return {
        write,
        values: new Set(soon.map(r => r.body)),
        later: new Set(reads.map(r => r.body)),
      }
    }
    const eventual = await read('eventual')
    const strong = await read('strong')
    assert.ok(eventual.write.atUs < strong.write.atUs, 'a strong write waits for a quorum')
    assert.deepEqual(
      [...eventual.values].sort(),
      ['v1', 'v2'],
      'an eventual read may find a replica behind'
    )
    assert.deepEqual(
      [...eventual.later],
      ['v2'],
      'every replica has it once the slowest has applied it'
    )
    assert.deepEqual([...strong.later], ['v2'], 'a strong read after a strong write sees it')
  })

  it('spreads requests without a key over its partitions by hot-key skew', async () => {
    /** @param {number} hotKeySkew */
    const hottest = async hotKeySkew => {
      const db = database({ partitions: 4, hotKeySkew })
      Array.from({ length: 400 }, (_, i) => call(db, 'get', {}, i * 2.5))
      await db.runUntil(2000)
      return /** @type {number} */ (series(db, 'hotPartition').at(-1)?.[1])
    }
    const skewed = await hottest(1.5)
    const uniform = await hottest(0)
    assert.ok(skewed > 0.5, `the hottest partition takes ${skewed} of the skewed load`)
    assert.ok(uniform < 0.35, `and ${uniform} of uniform load`)
  })

  it('covers every public method, every declared error and every metric it declares', () => {
    const declared = Object.entries(manifest.methods.public)
    assert.deepEqual([...covered.methods].sort(), declared.map(([name]) => name).sort())
    const errors = new Set(declared.flatMap(([, method]) => method.errors ?? []))
    assert.deepEqual(
      [...covered.errors].filter(code => errors.has(code)).sort(),
      [...errors].sort()
    )
    const reported = Object.keys(manifest.metrics).filter(name => !manifest.metrics[name].estimate)
    for (const name of reported) assert.ok(covered.metrics.has(name), `reports ${name}`)
  })
})
