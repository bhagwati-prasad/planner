// @ts-check
// Self-tests of the starter search index (task 0425, spec §9): documents become searchable only
// at the refresh after they are indexed, at the indexing throughput; a full indexing buffer
// rejects documents; searches match every term and fan out to every shard; deletes and merges.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A search index in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} [props]
 */
function searchIndex(props = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { queryLatency: { kind: 'constant', value: 15 }, indexSize: '0B', ...props },
  })
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

/** @param {any} api @param {string} method @param {unknown} body */
const call = (api, method, body, atMs = 0, sizeBytes = undefined) =>
  api.call(method, body, { atMs, ...(sizeBytes ? { sizeBytes } : {}) })

/** The ids a search found. @param {any} reply */
const ids = reply => reply.body?.map((/** @type {any} */ hit) => hit.id)

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

describe('search index', () => {
  it('finds a document indexed only after the next refresh', async () => {
    const api = searchIndex({ refreshInterval: '1s' })
    const indexed = call(api, 'index', { id: 'd1', doc: { title: 'red apple' } }, 100)
    const before = call(api, 'search', { query: 'apple' }, 500)
    const after = call(api, 'search', { query: 'apple' }, 1100)
    await api.runUntil(2000)
    assert.deepEqual(indexed.body, { id: 'd1' })
    assert.deepEqual(ids(before), [])
    assert.deepEqual(after.body, [{ id: 'd1', doc: { title: 'red apple' } }])
    assert.equal(after.atUs, 1115 * MS, 'a search takes its query latency')
    assert.deepEqual(series(api, 'indexingLag'), [[1000, 0.9]])
  })

  it('indexes at its indexing throughput, so documents wait for later refreshes', async () => {
    const api = searchIndex({ refreshInterval: '1s', indexingThroughput: '10/s' })
    for (let i = 0; i < 25; i++) call(api, 'index', { id: `d${i}`, doc: { n: 'item' } }, 0)
    const counts = [1500, 2500, 3500].map(at => call(api, 'search', { query: 'item' }, at))
    await api.runUntil(4000)
    assert.deepEqual(
      counts.map(r => r.body.length),
      [10, 20, 25]
    )
    assert.deepEqual(
      series(api, 'indexingLag').map(([at, s]) => [at, s]),
      [
        [1000, 1],
        [2000, 2],
        [3000, 3],
      ],
      'the oldest document each refresh made searchable'
    )
  })

  it('rejects documents once its indexing buffer, a tenth of its heap, is full', async () => {
    const api = searchIndex({ heap: '100KB', indexingThroughput: '1/s' })
    const replies = Array.from({ length: 12 }, (_, i) =>
      call(api, 'index', { id: `d${i}`, doc: {} }, 0, 1000)
    )
    await api.runUntil(100)
    assert.deepEqual(
      replies.map(r => r.error?.code ?? r.status),
      [...Array(10).fill('ok'), 'REJECTED', 'REJECTED']
    )
    assert.equal(series(api, 'rejections').length, 2)
  })

  it('matches every term of a query, best first, and drops deleted documents at the next refresh', async () => {
    const api = searchIndex({ refreshInterval: '1s' })
    call(api, 'index', { id: 'a', doc: { title: 'Red apple', note: 'apple pie' } }, 0)
    call(api, 'index', { id: 'b', doc: { title: 'Green apple' } }, 0)
    call(api, 'index', { id: 'c', doc: { title: 'Red car' } }, 0)
    const replies = [
      call(api, 'search', { query: 'apple' }, 1100),
      call(api, 'search', { query: 'red APPLE' }, 1100),
      call(api, 'delete', { id: 'a' }, 1200),
      call(api, 'search', { query: 'apple' }, 1300),
      call(api, 'search', { query: 'apple' }, 2100),
    ]
    await api.runUntil(3000)
    assert.deepEqual([replies[0], replies[1], replies[3], replies[4]].map(ids), [
      ['a', 'b'],
      ['a'],
      ['a', 'b'],
      ['b'],
    ])
    assert.equal(series(api, 'queries').length, 4)
  })

  it('keeps deleted documents in its index size until a merge', async () => {
    const api = searchIndex({ refreshInterval: '1s' })
    call(api, 'index', { id: 'a', doc: {} }, 0, 4000)
    call(api, 'index', { id: 'b', doc: {} }, 0, 6000)
    call(api, 'delete', { id: 'a' }, 1500)
    await api.runUntil(12_000)
    assert.deepEqual(series(api, 'indexSize'), [
      [1000, 10_000],
      [10_000, 6000],
    ])
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
