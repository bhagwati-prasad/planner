// @ts-check
// Self-tests of the starter message queue (task 0408, spec §9): every public method and every
// declared error, expiry by retention at the right simulated time, each overflow policy, the
// delivery guarantees, the dead-letter queue, the egress rate and fixed ingress.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTestContext } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A queue, with property values as a person writes them.
 * @param {Record<string, unknown>} [props]
 * @returns {any}
 */
const queue = (props = {}) => createTestContext({ manifest, behaviour, props })

/** Notes the failures and metrics a context has seen, and when its timers are due. @param {any} ctx */
function observe(ctx) {
  for (const f of ctx.failures) covered.errors.add(f.code)
  for (const m of ctx.metrics) covered.metrics.add(m.name)
  for (const t of ctx.scheduled) t.at ??= ctx.now + t.delay
}

/**
 * Calls a public method with a message of `sizeBytes` bytes.
 * @param {any} ctx @param {string} method @param {unknown} [body] @param {number} [sizeBytes]
 */
function call(ctx, method, body, sizeBytes = 100) {
  covered.methods.add(method)
  const out = behaviour.public[method]({ body, sizeBytes }, ctx)
  observe(ctx)
  return out
}

/** Fires the timers due by `until`, earliest first, moving the clock. @param {any} ctx @param {number} until */
function runTimers(ctx, until) {
  for (;;) {
    observe(ctx)
    const [next] = ctx.scheduled
      .filter((/** @type {any} */ t) => !t.fired && t.at <= until)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => a.at - b.at)
    if (!next) break
    next.fired = true
    ctx.now = next.at
    behaviour.onTimer({ name: next.name, data: next.data }, ctx)
  }
  ctx.now = until
}

const bodies = (/** @type {any[]} */ messages) => messages.map(m => m.body)
const metric = (/** @type {any} */ ctx, /** @type {string} */ name) =>
  ctx.metrics
    .filter((/** @type {any} */ m) => m.name === name)
    .map((/** @type {any} */ m) => m.value)

describe('message queue', () => {
  it('publishes, receives, acknowledges and returns messages, and refuses what it cannot take', () => {
    const ctx = queue({ maxMessageSize: '1KB' })
    assert.deepEqual(call(ctx, 'publish', 'a'), { id: '1' })
    assert.deepEqual(call(ctx, 'publish', 'b'), { id: '2' })
    assert.equal(call(ctx, 'publish', 'huge', 2000).code, 'MESSAGE_TOO_LARGE')
    assert.deepEqual(call(ctx, 'receive', { max: 1 }), [{ id: '1', body: 'a', receives: 1 }])
    assert.deepEqual(call(ctx, 'nack', { id: '1' }), { ok: true })
    assert.deepEqual(call(ctx, 'receive', { max: 5 }), [
      { id: '1', body: 'a', receives: 2 },
      { id: '2', body: 'b', receives: 1 },
    ])
    assert.deepEqual(call(ctx, 'ack', { id: '1' }), { ok: true })
    assert.equal(call(ctx, 'ack', { id: '1' }).code, 'UNKNOWN_MESSAGE')
    assert.equal(call(ctx, 'nack', { id: '9' }).code, 'UNKNOWN_MESSAGE')
    assert.deepEqual(call(ctx, 'receive', { max: 5 }), [], 'message 2 is still in flight')
  })

  it('expires messages at the right simulated time', () => {
    const ctx = queue({ retention: '10s' })
    call(ctx, 'publish', 'a')
    ctx.now = 4000
    call(ctx, 'publish', 'b')
    runTimers(ctx, 9999)
    assert.deepEqual(bodies(ctx.state.messages), ['a', 'b'], 'nothing expires early')
    runTimers(ctx, 10_000)
    assert.deepEqual(bodies(ctx.state.messages), ['b'], 'a expires at 10 s')
    runTimers(ctx, 14_000)
    assert.deepEqual(bodies(ctx.state.messages), [], 'b expires at 14 s')
    assert.deepEqual(metric(ctx, 'expired'), [1, 1])
    call(ctx, 'publish', 'c')
    ctx.now = 24_000
    assert.deepEqual(
      call(ctx, 'receive', { max: 1 }),
      [],
      'a receive never returns an expired message'
    )
  })

  it('respects its overflow policy', () => {
    const full = (/** @type {string} */ overflowPolicy, extra = {}) => {
      const ctx = queue({ capacityMessages: 2, overflowPolicy, ...extra })
      const replies = ['a', 'b', 'c'].map(body => call(ctx, 'publish', body))
      return { ctx, replies }
    }
    const reject = full('reject')
    assert.equal(reject.replies[2].code, 'QUEUE_FULL')
    assert.deepEqual(bodies(reject.ctx.state.messages), ['a', 'b'])
    assert.deepEqual(metric(reject.ctx, 'rejected'), [1])

    const drop = full('drop-oldest')
    assert.deepEqual(drop.replies[2], { id: '3' })
    assert.deepEqual(bodies(drop.ctx.state.messages), ['b', 'c'])
    assert.deepEqual(metric(drop.ctx, 'dropped'), [1])

    const block = full('block-producer')
    assert.deepEqual(block.replies[2], { id: '3', blocked: true })
    assert.deepEqual(bodies(block.ctx.state.messages), ['a', 'b'])
    call(block.ctx, 'receive', { max: 1 })
    assert.deepEqual(bodies(block.ctx.state.messages), ['b', 'c'], 'space let the blocked one in')
    assert.deepEqual(block.ctx.state.blocked, [])

    const bytes = full('reject', { capacityMessages: 10, capacityBytes: '250B' })
    assert.equal(bytes.replies[2].code, 'QUEUE_FULL', 'three 100-byte messages exceed 250 B')
  })

  it('redelivers after the visibility timeout, and dead-letters after maxReceives', () => {
    const ctx = queue({ visibilityTimeout: '30s', maxReceives: 2, dlqTarget: 'dead-letters' })
    call(ctx, 'publish', 'a')
    call(ctx, 'receive', { max: 1 })
    runTimers(ctx, 30_000)
    assert.deepEqual(call(ctx, 'receive', { max: 1 }), [{ id: '1', body: 'a', receives: 2 }])
    runTimers(ctx, 60_000)
    assert.deepEqual(ctx.state.messages, [])
    assert.deepEqual(bodies(ctx.state.deadLetters), ['a'])
    assert.deepEqual(ctx.emitted, [{ port: 'dlq', method: 'publish', args: 'a' }])
    assert.deepEqual(metric(ctx, 'sentToDlq'), [1])
  })

  it('delivers at most once, exactly once or in order per key, as configured', () => {
    const atMostOnce = queue({ deliveryGuarantee: 'at-most-once' })
    call(atMostOnce, 'publish', 'a')
    call(atMostOnce, 'receive', { max: 1 })
    assert.deepEqual(atMostOnce.state.inFlight, {}, 'nothing waits for an ack')

    const exactlyOnce = queue({ deliveryGuarantee: 'exactly-once' })
    assert.deepEqual(call(exactlyOnce, 'publish', { dedupId: 'x' }), { id: '1' })
    assert.deepEqual(call(exactlyOnce, 'publish', { dedupId: 'x' }), { id: '1', duplicate: true })
    assert.equal(exactlyOnce.state.messages.length, 1)

    const perKey = queue({ ordering: 'per-key' })
    for (const body of [
      { key: 'k1', n: 1 },
      { key: 'k1', n: 2 },
      { key: 'k2', n: 3 },
    ])
      call(perKey, 'publish', body)
    const first = call(perKey, 'receive', { max: 3 })
    assert.deepEqual(
      first.map((/** @type {any} */ m) => m.body.n),
      [1, 3],
      'k1’s second waits'
    )
    call(perKey, 'ack', { id: first[0].id })
    assert.deepEqual(
      call(perKey, 'receive', { max: 3 }).map((/** @type {any} */ m) => m.body.n),
      [2]
    )
  })

  it('delivers no faster than its consumers’ egress rate', () => {
    const ctx = queue({ consumers: 1, perConsumerRate: '2/s' })
    for (const body of 'abcde') call(ctx, 'publish', body)
    const received = (/** @type {number} */ at) => {
      ctx.now = at
      return call(ctx, 'receive', { max: 5 }).length
    }
    assert.deepEqual([received(0), received(0), received(500), received(1500)], [2, 0, 1, 2])
  })

  it('generates messages at its ingress rate when the ingress mode is fixed', () => {
    const ctx = queue({ ingressMode: 'fixed', ingressRate: '10/s' })
    behaviour.init(ctx)
    runTimers(ctx, 1000)
    assert.equal(ctx.state.messages.length, 10)
    assert.equal(ctx.state.messages[9].enqueuedAt, 1000)
  })

  it('reports depth, fill, ingress, egress, oldest age and time in queue', () => {
    const ctx = queue({ capacityMessages: 4 })
    call(ctx, 'publish', 'a')
    call(ctx, 'publish', 'b')
    ctx.now = 1500
    call(ctx, 'receive', { max: 1 })
    assert.deepEqual(metric(ctx, 'ingress'), [1, 1])
    assert.deepEqual(metric(ctx, 'egress'), [1])
    assert.deepEqual(metric(ctx, 'timeInQueue'), [1500])
    assert.deepEqual(metric(ctx, 'depth'), [1, 2, 1])
    assert.deepEqual(metric(ctx, 'fill'), [0.25, 0.5, 0.25])
    assert.deepEqual(metric(ctx, 'oldestAge'), [0, 0, 1.5])
  })

  it('covers every public method, every declared error and every metric it reports', () => {
    const declared = Object.entries(manifest.methods.public)
    assert.deepEqual([...covered.methods].sort(), declared.map(([name]) => name).sort())
    const errors = new Set(declared.flatMap(([, method]) => method.errors ?? []))
    assert.deepEqual([...covered.errors].sort(), [...errors].sort())
    const reported = Object.entries(manifest.metrics)
      .filter(([, m]) => !m.estimate)
      .map(([name]) => name.replace(/\.p\d+$/, ''))
    assert.deepEqual([...covered.metrics].sort(), [...new Set(reported)].sort())
  })
})
