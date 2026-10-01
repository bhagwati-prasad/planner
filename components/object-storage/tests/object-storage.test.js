// @ts-check
// Self-tests of the starter object storage (task 0424, spec §9): a request-rate limit per key
// prefix, first-byte latency plus transfer time at its throughput, storage classes and lifecycle
// rules, availability, and the bytes it stores and serves.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000
const DAY = 86_400_000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * Object storage in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} [props]
 */
function storage(props = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { firstByteLatency: { kind: 'constant', value: 20 }, availability: 100, ...props },
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

/** A reply's body, or its error's code. @param {any} reply */
const outcome = reply => (reply.status === 'ok' ? reply.body : reply.error?.code)

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

describe('object storage', () => {
  it('throttles requests over the rate limit of one prefix while other prefixes serve every request', async () => {
    const api = storage({ requestRateLimit: '5/s' })
    const logs = Array.from({ length: 8 }, (_, i) =>
      call(api, 'put', { key: `logs/2026/${i}` }, i * 10)
    )
    const images = Array.from({ length: 5 }, (_, i) =>
      call(api, 'put', { key: `images/${i}.png` }, i * 10)
    )
    const nextSecond = call(api, 'put', { key: 'logs/2026/late' }, 1000)
    await api.runUntil(5000)
    assert.deepEqual(
      logs.map(r => r.error?.code ?? r.status),
      [...Array(5).fill('ok'), ...Array(3).fill('THROTTLED')]
    )
    assert.deepEqual(logs[7].error?.details, { prefix: 'logs/2026' })
    assert.ok(
      images.every(r => r.status === 'ok'),
      'images/ has a limit of its own'
    )
    assert.equal(nextSecond.status, 'ok', 'the limit is per second')
    assert.equal(series(api, 'throttles').length, 3)
  })

  it('takes its first-byte latency plus the transfer at its throughput, and stores, lists and deletes objects', async () => {
    const api = storage({ throughput: 100, objectSize: '1MB' })
    const replies = [
      call(api, 'put', { key: 'videos/a.mp4', body: 'A' }, 0, 50_000_000),
      call(api, 'put', { key: 'videos/b.mp4', body: 'B' }, 0),
      call(api, 'get', { key: 'videos/a.mp4' }, 1000),
      call(api, 'list', { prefix: 'videos/' }, 2000),
      call(api, 'delete', { key: 'videos/b.mp4' }, 3000),
      call(api, 'get', { key: 'videos/b.mp4' }, 4000),
    ]
    await api.runUntil(10_000)
    assert.deepEqual(replies.map(outcome), [
      { key: 'videos/a.mp4', size: 50_000_000 },
      { key: 'videos/b.mp4', size: 1_000_000 },
      'A',
      [
        { key: 'videos/a.mp4', size: 50_000_000, storageClass: 'standard' },
        { key: 'videos/b.mp4', size: 1_000_000, storageClass: 'standard' },
      ],
      null,
      'NO_SUCH_KEY',
    ])
    assert.deepEqual(
      replies.map(r => r.atUs / MS),
      [520, 30, 1520, 2020, 3020, 4020],
      '20 ms to the first byte, then 10 ms per MB at 100 MB/s'
    )
    assert.deepEqual(
      series(api, 'bytesStored').map(([, bytes]) => bytes),
      [50_000_000, 51_000_000, 50_000_000]
    )
    assert.deepEqual(series(api, 'egress'), [[1000, 0.05]], 'GB served')
    assert.equal(series(api, 'puts').length, 2)
    assert.equal(series(api, 'gets').length, 2)
  })

  it('moves objects through storage classes by its lifecycle rules, and cannot get an archived object', async () => {
    const api = storage({
      lifecycleRules: ['infrequent-access after 30d', 'archive after 60d', 'expire after 90d'],
    })
    call(api, 'put', { key: 'backups/1', body: 'data' }, 0)
    const replies = [
      call(api, 'list', { prefix: 'backups/' }, 31 * DAY),
      call(api, 'get', { key: 'backups/1' }, 31 * DAY),
      call(api, 'get', { key: 'backups/1' }, 61 * DAY),
      call(api, 'get', { key: 'backups/1' }, 91 * DAY),
    ]
    await api.runUntil(100 * DAY)
    assert.deepEqual(replies.map(outcome), [
      [{ key: 'backups/1', size: 1_000_000, storageClass: 'infrequent-access' }],
      'data',
      'ARCHIVED',
      'NO_SUCH_KEY',
    ])
    assert.deepEqual(series(api, 'bytesStored').at(-1), [90 * DAY, 0], 'expired at 90 days')
  })

  it('fails requests at the rate its availability leaves', async () => {
    const api = storage({ availability: 90 })
    const replies = Array.from({ length: 1000 }, (_, i) => call(api, 'get', { key: 'x' }, i))
    await api.runUntil(5000)
    const unavailable = replies.filter(r => r.error?.code === 'UNAVAILABLE').length
    assert.ok(unavailable > 70 && unavailable < 130, `${unavailable} of 1000 unavailable at 90 %`)
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
