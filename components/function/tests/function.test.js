// @ts-check
// Self-tests of the starter serverless function (task 0419, spec §9): cold starts at their
// probability, and whenever no warm instance is idle; instances kept warm for keepWarmIdle;
// throttling at the maximum or reserved concurrency; the execution timeout; downstream calls;
// and the cost of each invocation.
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
 * A function in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} props @param {Record<string, unknown>} [replies]
 */
function fn(props, replies = {}) {
  const api = runComponent({ manifest, behaviour, props, replies })
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

/** Invokes the function at `atMs`. @param {any} api */
const invoke = (api, atMs = 0, body = { order: 1 }) => api.call('invoke', body, { atMs })

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

const constant = (/** @type {number} */ value) => ({ kind: 'constant', value })

describe('function', () => {
  it('cold-starts at the configured probability within tolerance over 10,000 seeded invocations', async () => {
    const api = fn({
      coldStartProbability: 20,
      coldStartLatency: constant(100),
      executionTime: constant(10),
      keepWarmIdle: '10m',
    })
    const replies = Array.from({ length: 10_000 }, (_, i) => invoke(api, i * 1000))
    await api.runUntil(10_001_000)
    const cold = series(api, 'coldStarts').length
    const rate = cold / replies.length
    assert.ok(Math.abs(rate - 0.2) <= 0.015, `cold-start rate ${rate}`)
    const slow = replies.filter((r, i) => r.atUs - i * 1000 * MS === 110 * MS).length
    assert.equal(slow, cold, 'each cold start adds its latency')
    assert.ok(
      replies.every((r, i) => r.status === 'ok' && r.atUs - i * 1000 * MS >= 10 * MS),
      'every invocation runs for its execution time'
    )
  })

  it('cold-starts when no warm instance is idle, and reclaims instances idle for keepWarmIdle', async () => {
    const api = fn({
      coldStartProbability: 0,
      coldStartLatency: constant(100),
      executionTime: constant(10),
      keepWarmIdle: '10m',
    })
    for (const atMs of [0, 0, 300_000, 300_000, 300_000, 1_000_000]) invoke(api, atMs)
    await api.runUntil(2_000_000)
    assert.deepEqual(series(api, 'coldStarts'), [
      [0, 1],
      [0, 1],
      [300_000, 1],
      [1_000_000, 1],
    ])
    assert.deepEqual(
      series(api, 'concurrentExecutions')
        .filter(([at]) => at === 300_000)
        .at(-1),
      [300_000, 3]
    )
  })

  it('throttles invocations over its maximum concurrency, or its reserved concurrency when set', async () => {
    const free = fn({
      maxConcurrency: 2,
      coldStartProbability: 0,
      coldStartLatency: constant(0),
      executionTime: constant(100),
    })
    const first = [invoke(free), invoke(free), invoke(free)]
    const later = invoke(free, 200)
    await free.runUntil(1000)
    assert.deepEqual(
      first.map(r => r.error?.code ?? r.status),
      ['ok', 'ok', 'THROTTLED']
    )
    assert.equal(later.status, 'ok')
    assert.deepEqual(series(free, 'throttles'), [[0, 1]])
    assert.equal(series(free, 'invocations').length, 3, 'a throttled invocation does not count')

    const reserved = fn({
      maxConcurrency: 2,
      reservedConcurrency: 1,
      coldStartProbability: 0,
      coldStartLatency: constant(0),
      executionTime: constant(100),
    })
    const capped = [invoke(reserved), invoke(reserved)]
    await reserved.runUntil(1000)
    assert.deepEqual(
      capped.map(r => r.error?.code ?? r.status),
      ['ok', 'THROTTLED']
    )
  })

  it('stops an execution at its timeout, bills by GB-second and invocation, and starts the next one cold', async () => {
    const api = fn({
      memory: '1GB',
      timeout: '200ms',
      coldStartProbability: 0,
      coldStartLatency: constant(100),
      executionTime: constant(500),
      pricePerGbSecond: 0.001,
      pricePerInvocation: 0.01,
    })
    const slow = invoke(api)
    const next = invoke(api, 1000)
    await api.runUntil(5000)
    assert.deepEqual(
      [slow.error?.code, slow.error?.details, slow.atUs],
      ['TIMEOUT', { timeoutMs: 200 }, 300 * MS],
      'after its cold start and its timeout'
    )
    assert.equal(next.atUs, (1000 + 300) * MS, 'a timed-out instance is not kept warm')
    const costs = series(api, 'cost').map(([, usd]) => usd)
    assert.equal(costs.length, 2)
    for (const usd of costs) assert.ok(Math.abs(usd - (0.01 + 0.001 * 1 * 0.3)) < 1e-12, `${usd}`)
  })

  it('calls its downstream calls in order after its execution time, and fails when one fails', async () => {
    const api = fn(
      {
        coldStartProbability: 0,
        coldStartLatency: constant(0),
        executionTime: constant(20),
        calls: ['out.put', 'out'],
      },
      { 'out.put': 'saved', out: (/** @type {any} */ body) => ({ got: body }) }
    )
    const done = invoke(api)
    await api.runUntil(1000)
    assert.deepEqual(
      [done.body, done.atUs],
      [{ 'out.put': 'saved', out: { got: { order: 1 } } }, 20 * MS]
    )

    const down = fn(
      { coldStartProbability: 0, executionTime: constant(20), calls: ['out'] },
      {
        out: () => {
          throw Object.assign(new Error('down'), { code: 'DOWN' })
        },
      }
    )
    const failed = invoke(down)
    await down.runUntil(5000)
    assert.deepEqual(
      [failed.error?.code, failed.error?.details],
      ['DEPENDENCY_FAILED', { port: 'out', code: 'DOWN' }]
    )
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
