// @ts-check
// Self-tests of the starter service (task 0409, spec §9, ADR 0020, ADR 0021): it queues on
// instances × concurrency servers, routes requests to its endpoints, spends each endpoint's
// service time, calls downstream through a circuit breaker per dependency with retries, and
// scales out after its scale-up delay.
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
 * A service in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} props @param {Record<string, unknown>} [replies]
 */
function service(props, replies = {}) {
  const api = runComponent({ manifest, behaviour, props, replies })
  const run = api.runUntil
  api.runUntil = async ms => {
    await run(ms)
    for (const m of api.metrics) covered.metrics.add(m.name.split('.')[0])
    for (const s of api.spans)
      if (s.node === 'it' && s.kind === 'public') covered.methods.add(s.method)
    for (const s of api.spans) if (s.node === 'it' && s.code) covered.errors.add(s.code)
  }
  return api
}

/** A request for `path`, at `atMs`. @param {any} api @param {string} path */
const request = (api, path = '/', atMs = 0, headers = {}) =>
  api.call('request', { order: 1 }, { atMs, path, headers })

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

describe('service', () => {
  it('queues the ninth concurrent request on 2 instances × 4 concurrency', async () => {
    const api = service({ instances: 2, concurrency: 4, serviceTime: 100 })
    const replies = Array.from({ length: 9 }, () => request(api))
    await api.runUntil(1000)
    assert.deepEqual(
      replies.map(r => [r.status, r.atUs]),
      [...Array(8).fill(['ok', 100 * MS]), ['ok', 200 * MS]]
    )
    const ninth = api.spans.filter(s => s.method === 'request')[8]
    assert.equal(ninth.queuedUs, 100 * MS)
  })

  it('refuses requests when its backlog is full, and gives up on those that wait past the timeout', async () => {
    const api = service({
      instances: 1,
      concurrency: 1,
      maxBacklog: 2,
      timeout: '150ms',
      serviceTime: 100,
    })
    const replies = Array.from({ length: 4 }, () => request(api))
    await api.runUntil(1000)
    assert.deepEqual(
      replies.map(r => r.error?.code ?? r.status),
      ['ok', 'ok', 'TIMEOUT', 'BACKLOG_FULL']
    )
  })

  it('routes each request to its endpoint, spends its service time and calls its dependencies', async () => {
    const api = service(
      {
        serviceTime: 10,
        endpoints: [
          { name: 'GET /orders', serviceTime: { kind: 'constant', value: 30 }, calls: ['out.get'] },
          { name: '/orders/new', calls: ['out', 'out.put'] },
        ],
      },
      {
        'out.get': { id: 7 },
        'out.put': 'saved',
        out: (/** @type {any} */ body) => ({ charged: body }),
      }
    )
    const get = request(api, '/orders/7', 0, { method: 'GET' })
    const post = request(api, '/orders/new', 0, { method: 'POST' })
    const wrongVerb = request(api, '/orders/7', 0, { method: 'DELETE' })
    const nowhere = request(api, '/users')
    const health = api.call('health', undefined)
    await api.runUntil(1000)
    assert.deepEqual([get.body, get.atUs], [{ 'out.get': { id: 7 } }, 30 * MS])
    assert.deepEqual(
      [post.body, post.atUs],
      [{ out: { charged: { order: 1 } }, 'out.put': 'saved' }, 10 * MS],
      'the most specific endpoint, at the service’s own service time'
    )
    assert.equal(wrongVerb.error?.code, 'NO_ENDPOINT')
    assert.equal(nowhere.error?.code, 'NO_ENDPOINT')
    assert.deepEqual(health.body, { status: 'up', liveInstances: 1 })
  })

  it('retries a failed dependency after a doubling backoff', async () => {
    let calls = 0
    const api = service(
      {
        serviceTime: 10,
        retries: 2,
        retryBackoff: '100ms',
        endpoints: [{ name: '/pay', calls: ['out'] }],
      },
      {
        out: () => {
          if (++calls < 3) throw Object.assign(new Error('busy'), { code: 'BUSY' })
          return 'paid'
        },
      }
    )
    const paid = request(api, '/pay')
    await api.runUntil(1000)
    assert.deepEqual([paid.body, paid.atUs], [{ out: 'paid' }, (10 + 100 + 200) * MS])

    const never = service(
      {
        serviceTime: 10,
        retries: 1,
        retryBackoff: '100ms',
        endpoints: [{ name: '/pay', calls: ['out'] }],
      },
      {
        out: () => {
          throw Object.assign(new Error('down'), { code: 'DOWN' })
        },
      }
    )
    const failed = request(never, '/pay')
    await never.runUntil(1000)
    assert.deepEqual(
      [failed.error?.code, failed.error?.details],
      ['DEPENDENCY_FAILED', { port: 'out', code: 'DOWN' }]
    )
    assert.deepEqual(series(never, 'errors'), [[110, 1]])
  })

  it('opens the circuit breaker at its error threshold, and half-opens it after its duration', async () => {
    let calls = 0
    const api = service(
      {
        serviceTime: 10,
        retries: 0,
        circuitBreaker: true,
        breakerErrorThreshold: 50,
        breakerOpenDuration: '30s',
        endpoints: [{ name: '/pay', calls: ['out'] }],
      },
      {
        out: () => {
          calls++
          if (calls <= 5) throw Object.assign(new Error('down'), { code: 'DOWN' })
          return 'paid'
        },
      }
    )
    const replies = [0, 1, 2, 3, 4, 5, 35].map(s => request(api, '/pay', s * 1000))
    await api.runUntil(60_000)
    assert.deepEqual(
      replies.map(r => r.error?.code ?? r.status),
      [...Array(5).fill('DEPENDENCY_FAILED'), 'CIRCUIT_OPEN', 'ok']
    )
    assert.equal(calls, 6, 'an open circuit calls nothing')
    assert.deepEqual(series(api, 'circuitState.out'), [
      [4010, 'open'],
      [34010, 'half-open'],
      [35010, 'closed'],
    ])
  })

  it('scales out after its scale-up delay while busy, within its maximum, and in when idle after its cooldown', async () => {
    const api = service({
      instances: 1,
      concurrency: 1,
      serviceTime: 97_000,
      timeout: '1000s',
      autoscaling: true,
      minInstances: 1,
      maxInstances: 2,
      targetUtilisation: 50,
      scaleUpDelay: '30s',
      cooldown: '60s',
    })
    const replies = Array.from({ length: 3 }, () => request(api))
    await api.runUntil(300_000)
    assert.deepEqual(
      replies.map(r => r.atUs / MS),
      [97_000, 137_000, 194_000],
      'the second starts at 40 s on the new instance; the third waits for a server, as a third instance is over the maximum'
    )
    assert.deepEqual(series(api, 'liveInstances'), [
      [0, 1],
      [40_000, 2],
      [200_000, 1],
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
