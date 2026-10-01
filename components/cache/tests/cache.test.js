// @ts-check
// Self-tests of the starter cache (task 0423, spec §9): LRU, LFU, TTL and random eviction, expiry,
// hit ratio under access skew, the write policies against its origin, and memory with replicas.
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
 * A cache in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} [props]
 * @param {Record<string, unknown>} [replies]  for the origin
 */
function cache(props = {}, replies = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { hitLatency: { kind: 'constant', value: 1 }, replication: 0, ...props },
    replies,
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

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

const HOUR = 3_600_000

/**
 * Sets a, b and c, reads a three times, then b, then c, and sets d into a cache of three; the
 * values left afterwards.
 * @param {string} eviction
 */
async function survivors(eviction) {
  const api = cache({ eviction, capacityItems: 3 })
  call(api, 'set', { key: 'a', value: 'A', ttl: HOUR }, 0)
  call(api, 'set', { key: 'b', value: 'B', ttl: HOUR }, 1)
  call(api, 'set', { key: 'c', value: 'C', ttl: 10_000 }, 2)
  for (const [key, at] of /** @type {const} */ ([
    ['a', 3],
    ['a', 4],
    ['a', 5],
    ['b', 6],
    ['c', 7],
  ]))
    call(api, 'get', { key }, at)
  call(api, 'set', { key: 'd', value: 'D', ttl: HOUR }, 8)
  const left = ['a', 'b', 'c', 'd'].map(key => call(api, 'get', { key }, 20))
  await api.runUntil(100)
  return { left: left.map(r => r.body), evictions: series(api, 'evictions').length }
}

describe('cache', () => {
  it('evicts the expected keys under LRU, LFU and TTL eviction, and one key at random', async () => {
    assert.deepEqual((await survivors('lru')).left, [null, 'B', 'C', 'D'], 'a was used longest ago')
    assert.deepEqual(
      (await survivors('lfu')).left,
      ['A', null, 'C', 'D'],
      'b and c were used least; b longer ago'
    )
    assert.deepEqual((await survivors('ttl')).left, ['A', 'B', null, 'D'], 'c expires soonest')
    const random = await survivors('random')
    assert.equal(random.left.filter(v => v === null).length, 1)
    assert.equal(random.left[3], 'D')
    assert.equal(random.evictions, 1)
  })

  it('expires an entry after its TTL, and deletes one on request', async () => {
    const api = cache({ ttl: '10s' })
    call(api, 'set', { key: 'x', value: 1 }, 0)
    call(api, 'set', { key: 'y', value: 2 }, 0)
    const replies = [
      call(api, 'get', { key: 'x' }, 9000),
      call(api, 'get', { key: 'x' }, 11_000),
      call(api, 'delete', { key: 'y' }, 100),
      call(api, 'get', { key: 'y' }, 200),
    ]
    await api.runUntil(20_000)
    assert.deepEqual(
      replies.map(r => r.body),
      [1, null, null, null]
    )
    assert.deepEqual(series(api, 'keys').at(-1), [10_000, 0], 'x expired at 10 s')
  })

  it('hits more often the more skewed the access to its keyspace', async () => {
    /** @param {number} accessSkew */
    const ratio = async accessSkew => {
      const api = cache({ keyspaceSize: 1000, capacityItems: 100, accessSkew })
      for (let i = 0; i < 2000; i++) call(api, 'get', {}, i)
      await api.runUntil(5000)
      return /** @type {number} */ (series(api, 'hitRatio').at(-1)?.[1])
    }
    const skewed = await ratio(1.2)
    const uniform = await ratio(0)
    assert.ok(skewed > 0.5, `hit ratio ${skewed} with skew 1.2`)
    assert.ok(uniform < 0.2, `hit ratio ${uniform} with uniform access`)
  })

  it('writes to its origin by its write policy', async () => {
    /** @param {string} writePolicy @param {Record<string, unknown>} [props] */
    const policy = async (writePolicy, props = {}) => {
      /** @type {unknown[]} */
      const writes = []
      const api = cache(
        { writePolicy, ...props },
        { origin: (/** @type {unknown} */ body) => (writes.push(body), 'ok') }
      )
      const set = call(api, 'set', { key: 'a', value: 'A' }, 0)
      const read = call(api, 'get', { key: 'a' }, 10)
      call(api, 'set', { key: 'b', value: 'B' }, 20)
      await api.runUntil(1000)
      return { writes, set: set.status, read: read.body }
    }
    assert.deepEqual(await policy('write-through'), {
      writes: [
        { key: 'a', value: 'A' },
        { key: 'b', value: 'B' },
      ],
      set: 'ok',
      read: 'A',
    })
    assert.deepEqual(await policy('write-around'), {
      writes: [
        { key: 'a', value: 'A' },
        { key: 'b', value: 'B' },
      ],
      set: 'ok',
      read: null,
    })
    assert.deepEqual(
      await policy('write-back', { capacityItems: 1 }),
      { writes: [{ key: 'a', value: 'A' }], set: 'ok', read: 'A' },
      'a reaches the origin only when b evicts it'
    )

    const failing = cache(
      {},
      {
        origin: () => {
          throw Object.assign(new Error('down'), { code: 'DOWN' })
        },
      }
    )
    const refused = call(failing, 'set', { key: 'a', value: 'A' })
    await failing.runUntil(1000)
    assert.deepEqual(
      [refused.error?.code, refused.error?.details],
      ['ORIGIN_FAILED', { code: 'DOWN' }]
    )
  })

  it('counts each replica in its memory, and fills by items or memory', async () => {
    const api = cache({ capacityMemory: '1KB', capacityItems: 4, replication: 1 })
    call(api, 'set', { key: 'a', value: 'A' }, 0, 400)
    call(api, 'set', { key: 'b', value: 'B' }, 1, 400)
    await api.runUntil(100)
    assert.deepEqual(
      series(api, 'memoryUsed').map(([, bytes]) => bytes),
      [800, 800],
      'b and its replica would pass 1 KB, so a is evicted first'
    )
    assert.equal(series(api, 'evictions').length, 1)
    assert.deepEqual(series(api, 'fill').at(-1), [1, 0.8])
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
