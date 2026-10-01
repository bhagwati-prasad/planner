// @ts-check
// Self-tests of the starter API gateway (task 0420, spec §9): it throttles traffic above its rate
// limit per key, matches its routes, refuses oversized payloads, authenticates by its auth mode,
// answers from its response cache, spends its transform latency, and gives up on the upstream at
// its request timeout.
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
 * A gateway in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} props
 * @param {{ replies?: Record<string, unknown>, edges?: Record<string, Record<string, unknown>> }} [stubs]
 */
function gateway(props, { replies = { out: 'ok' }, edges } = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { authMode: 'none', transformLatency: constant(0), ...props },
    replies,
    edges,
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

/**
 * A request through the gateway.
 * @param {any} api @param {{ at?: number, path?: string, headers?: Record<string, string>, sizeBytes?: number, body?: unknown }} [request]
 */
const send = (
  api,
  { at = 0, path = '/orders', headers = {}, sizeBytes, body = { order: 1 } } = {}
) => api.call('forward', body, { atMs: at, path, headers, ...(sizeBytes ? { sizeBytes } : {}) })

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

/** @param {any[]} replies */
const outcomes = replies => replies.map(r => r.error?.code ?? r.status)

function constant(/** @type {number} */ value) {
  return { kind: 'constant', value }
}

describe('api gateway', () => {
  it('throttles traffic above its rate limit, per key, after its burst', async () => {
    const steady = gateway({ rateLimit: '10/s', burst: 1 })
    const key = { 'x-api-key': 'shop' }
    const twentyPerSecond = Array.from({ length: 20 }, (_, i) =>
      send(steady, { at: i * 50, headers: key })
    )
    await steady.runUntil(2000)
    assert.deepEqual(
      outcomes(twentyPerSecond),
      Array.from({ length: 20 }, (_, i) => (i % 2 ? 'THROTTLED' : 'ok')),
      'twice its rate: every other request is throttled'
    )
    assert.equal(series(steady, 'throttled').length, 10)

    const bursty = gateway({ rateLimit: '10/s', burst: 5 })
    const burst = Array.from({ length: 6 }, () => send(bursty, { headers: key }))
    const other = send(bursty, { headers: { 'x-api-key': 'partner' } })
    const later = Array.from({ length: 6 }, () => send(bursty, { at: 1000, headers: key }))
    await bursty.runUntil(2000)
    assert.deepEqual(outcomes(burst), [...Array(5).fill('ok'), 'THROTTLED'])
    assert.equal(other.status, 'ok', 'each key has its own bucket')
    assert.deepEqual(
      outcomes(later),
      [...Array(5).fill('ok'), 'THROTTLED'],
      'a second later its bucket is full again, at its burst'
    )
  })

  it('matches its routes, refuses payloads over its maximum, and forwards the path and body', async () => {
    const api = gateway(
      { routes: ['GET /orders/*', 'POST /orders'], maxPayload: '1KB' },
      { replies: { out: (/** @type {any} */ body) => ({ upstream: body }) } }
    )
    const replies = [
      send(api, { path: '/orders/7', headers: { method: 'GET' } }),
      send(api, { path: '/orders', headers: { method: 'POST' } }),
      send(api, { path: '/orders/7', headers: { method: 'DELETE' } }),
      send(api, { path: '/users', headers: { method: 'GET' } }),
      send(api, { path: '/orders', headers: { method: 'POST' }, sizeBytes: 2000 }),
    ]
    await api.runUntil(1000)
    assert.deepEqual(outcomes(replies), ['ok', 'ok', 'NO_ROUTE', 'NO_ROUTE', 'PAYLOAD_TOO_LARGE'])
    assert.deepEqual(replies[0].body, { upstream: { order: 1 } })
  })

  it('authenticates by its auth mode, counting failures', async () => {
    const keys = gateway({ authMode: 'api-key' })
    const [without, withKey] = [send(keys), send(keys, { headers: { 'x-api-key': 'shop' } })]
    const jwt = gateway({ authMode: 'jwt' })
    const [bearer, basic] = [
      send(jwt, { headers: { Authorization: 'Bearer abc.def.ghi' } }),
      send(jwt, { headers: { authorization: 'Basic c2hvcA==' } }),
    ]
    await keys.runUntil(1000)
    await jwt.runUntil(1000)
    assert.deepEqual(outcomes([without, withKey, bearer, basic]), [
      'AUTH_FAILED',
      'ok',
      'ok',
      'AUTH_FAILED',
    ])
    assert.deepEqual(series(keys, 'authFailures'), [[0, 1]])
  })

  it('spends its transform latency, and gives up on the upstream at its request timeout', async () => {
    const slow = gateway(
      { requestTimeout: '100ms', transformLatency: constant(5) },
      { edges: { out: { latency: 80 } } }
    )
    const fast = gateway(
      { requestTimeout: '100ms', transformLatency: constant(5) },
      { edges: { out: { latency: 30 } } }
    )
    const down = gateway(
      {},
      {
        replies: {
          out: () => {
            throw Object.assign(new Error('down'), { code: 'DOWN' })
          },
        },
      }
    )
    const [late, quick, failed] = [send(slow), send(fast), send(down)]
    await slow.runUntil(1000)
    await fast.runUntil(1000)
    await down.runUntil(1000)
    assert.deepEqual(
      [late.error?.code, late.error?.details, late.atUs],
      ['GATEWAY_TIMEOUT', { timeoutMs: 100 }, 105 * MS],
      'a 160 ms round trip, cut at 100 ms after the transform'
    )
    assert.deepEqual([quick.body, quick.atUs], ['ok', 65 * MS])
    assert.deepEqual([failed.error?.code, failed.error?.details], ['BAD_GATEWAY', { code: 'DOWN' }])
  })

  it('answers repeated reads from its response cache for its TTL', async () => {
    let calls = 0
    const api = gateway(
      { responseCacheTtl: '10s' },
      { replies: { out: () => ({ version: ++calls }) } }
    )
    const replies = [
      send(api, { at: 0, headers: { method: 'GET' } }),
      send(api, { at: 1000, headers: { method: 'GET' } }),
      send(api, { at: 2000, headers: { method: 'POST' } }),
      send(api, { at: 11_000, headers: { method: 'GET' } }),
    ]
    await api.runUntil(20_000)
    assert.deepEqual(
      replies.map(r => r.body),
      [{ version: 1 }, { version: 1 }, { version: 2 }, { version: 3 }],
      'a hit within the TTL; a write is never cached; the entry expires'
    )
    assert.deepEqual(
      series(api, 'cacheHitRatio').map(([, ratio]) => ratio),
      [0, 0.5, 1 / 3]
    )

    const off = gateway({}, { replies: { out: () => ({ version: ++calls }) } })
    const [a, b] = [
      send(off, { headers: { method: 'GET' } }),
      send(off, { at: 10, headers: { method: 'GET' } }),
    ]
    await off.runUntil(1000)
    assert.notDeepEqual(a.body, b.body, 'a TTL of 0 turns the cache off')
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
