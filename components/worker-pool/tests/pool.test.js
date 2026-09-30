// @ts-check
// Self-tests of the starter worker pool (task 0408, spec §9): it polls its source every poll
// interval, hands each message to its handler with a free worker, prefetches into its buffer,
// retries failures with a doubling backoff, gives up on poison messages, and reports its status
// and metrics.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTestContext } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A started pool whose source holds `bodies` as messages 1, 2, 3…, and whose handler answers
 * with `handle`.
 * @param {Record<string, unknown>} props  property values as a person writes them
 * @param {{ bodies?: unknown[], handle?: (body: any) => unknown }} [options]
 * @returns {any}
 */
function pool(props, { bodies = [], handle = body => body } = {}) {
  const source = bodies.map((body, i) => ({ id: String(i + 1), body, receives: 1 }))
  const ctx = createTestContext({
    manifest,
    behaviour,
    props,
    replies: {
      'source.receive': (/** @type {any} */ { max }) => source.splice(0, max),
      out: (/** @type {any} */ body) => handle(body),
    },
  })
  behaviour.init(ctx)
  return ctx
}

/** Notes what a context has seen, and when its timers are due. @param {any} ctx */
function observe(ctx) {
  for (const f of ctx.failures) covered.errors.add(f.code)
  for (const m of ctx.metrics) covered.metrics.add(m.name)
  for (const t of ctx.scheduled) t.at ??= ctx.now + t.delay
}

/** Fires the timers due by `until`, earliest first, moving the clock. @param {any} ctx @param {number} until */
async function runTimers(ctx, until) {
  for (;;) {
    observe(ctx)
    const [next] = ctx.scheduled
      .filter((/** @type {any} */ t) => !t.fired && t.at <= until)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => a.at - b.at)
    if (!next) break
    next.fired = true
    ctx.now = next.at
    await behaviour.onTimer({ name: next.name, data: next.data }, ctx)
  }
  ctx.now = until
  observe(ctx)
}

/** @param {any} ctx @param {string} port @param {string} [method] */
const sentOn = (ctx, port, method) =>
  ctx.sent.filter((/** @type {any} */ s) => s.port === port && (!method || s.method === method))
const metric = (/** @type {any} */ ctx, /** @type {string} */ name) =>
  ctx.metrics
    .filter((/** @type {any} */ m) => m.name === name)
    .map((/** @type {any} */ m) => m.value)

/** @param {any} ctx */
const status = ctx => {
  covered.methods.add('status')
  return behaviour.public.status({}, ctx)
}

describe('worker pool', () => {
  it('polls its source every poll interval and hands each message to its handler with a free worker', async () => {
    const props = {
      consumers: 2,
      batchSize: 5,
      prefetch: 0,
      pollInterval: '100ms',
      processingTime: 50,
    }
    const ctx = pool(props, { bodies: ['a', 'b', 'c'] })
    await runTimers(ctx, 200)
    assert.deepEqual(
      sentOn(ctx, 'source', 'receive').map((/** @type {any} */ s) => s.args),
      [{ max: 2 }, { max: 2 }, { max: 2 }],
      'at 0, 100 and 200 ms, as many as its free workers'
    )
    assert.deepEqual(
      sentOn(ctx, 'out').map((/** @type {any} */ s) => [s.method, s.args]),
      [
        [null, 'a'],
        [null, 'b'],
        [null, 'c'],
      ],
      'the edge from out names the handler’s method'
    )
    assert.deepEqual(ctx.emitted, [
      { port: 'source', method: 'ack', args: { id: '1' } },
      { port: 'source', method: 'ack', args: { id: '2' } },
      { port: 'source', method: 'ack', args: { id: '3' } },
    ])
    assert.deepEqual(metric(ctx, 'throughput'), [1, 1, 1])
    assert.deepEqual(metric(ctx, 'batchLatency'), [50, 50])
    assert.deepEqual(metric(ctx, 'idle'), [1, 1, 1])
  })

  it('prefetches into its buffer while its workers are busy, and reports its status', async () => {
    const props = {
      consumers: 1,
      batchSize: 3,
      prefetch: 2,
      pollInterval: '1s',
      processingTime: 50,
    }
    const ctx = pool(props, { bodies: ['a', 'b', 'c'] })
    await runTimers(ctx, 0)
    assert.deepEqual(status(ctx), { consumers: 1, busy: 1, buffered: 2, idle: 0 })
    await runTimers(ctx, 50)
    assert.deepEqual(status(ctx), { consumers: 1, busy: 1, buffered: 1, idle: 0 })
    await runTimers(ctx, 150)
    assert.deepEqual(status(ctx), { consumers: 1, busy: 0, buffered: 0, idle: 1 })
    assert.deepEqual(metric(ctx, 'batchLatency'), [150], 'the batch took three turns of one worker')
  })

  it('retries a failed message after a doubling backoff, and gives up on a poison message', async () => {
    /** @type {number[]} */
    const tries = []
    const props = {
      consumers: 1,
      maxRetries: 2,
      backoff: '1s',
      pollInterval: '10s',
      processingTime: 50,
    }
    const ctx = pool(props, {
      bodies: ['bad'],
      handle: () => {
        tries.push(ctx.now)
        throw Object.assign(new Error('the handler is down'), { code: 'UNAVAILABLE' })
      },
    })
    await runTimers(ctx, 5000)
    assert.deepEqual(tries, [50, 1100, 3150], 'each retry waits its backoff, then processes again')
    assert.deepEqual(ctx.emitted, [{ port: 'source', method: 'nack', args: { id: '1' } }])
    assert.deepEqual(metric(ctx, 'retries'), [1, 1])
    assert.deepEqual(metric(ctx, 'poisonMessages'), [1])
    assert.deepEqual(status(ctx).busy, 0, 'the worker is free again')
  })

  it('covers every public method, every declared error and every metric it reports', () => {
    const declared = Object.entries(manifest.methods.public)
    assert.deepEqual([...covered.methods].sort(), declared.map(([name]) => name).sort())
    const errors = new Set(declared.flatMap(([, method]) => method.errors ?? []))
    assert.deepEqual([...covered.errors].sort(), [...errors].sort())
    const reported = Object.keys(manifest.metrics).filter(name => !manifest.metrics[name].estimate)
    assert.deepEqual([...covered.metrics].sort(), reported.sort())
  })
})
