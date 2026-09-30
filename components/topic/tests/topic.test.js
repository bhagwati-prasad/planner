// @ts-check
// Self-tests of the starter pub/sub topic (task 0408, spec §9): every public method and every
// declared error, partitions by key, consumer groups with their own offsets and lag, retention
// by time and size, compaction, delivery semantics and partition throughput.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTestContext } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A topic, with property values as a person writes them, after its init hook.
 * @param {Record<string, unknown>} [props]
 * @returns {any}
 */
function topic(props = {}) {
  const ctx = createTestContext({ manifest, behaviour, props })
  behaviour.init(ctx)
  return ctx
}

/**
 * Calls a public method with a message of `sizeBytes` bytes.
 * @param {any} ctx @param {string} method @param {unknown} [body] @param {number} [sizeBytes]
 */
function call(ctx, method, body, sizeBytes = 100) {
  covered.methods.add(method)
  const out = behaviour.public[method]({ body, sizeBytes }, ctx)
  for (const f of ctx.failures) covered.errors.add(f.code)
  for (const m of ctx.metrics) covered.metrics.add(m.name.split('.')[0])
  return out
}

/** The last value a metric reported. @param {any} ctx @param {string} name */
const last = (ctx, name) =>
  ctx.metrics.filter((/** @type {any} */ m) => m.name === name).at(-1)?.value

describe('pub/sub topic', () => {
  it('partitions by key, and each consumer group polls and commits from its own offsets', () => {
    const ctx = topic({ partitions: 2, orderingKey: 'user' })
    const a1 = call(ctx, 'publish', { user: 'ann', n: 1 })
    const a2 = call(ctx, 'publish', { user: 'ann', n: 2 })
    assert.equal(a2.partition, a1.partition, 'one key, one partition')
    assert.equal(a2.offset, a1.offset + 1)
    assert.deepEqual(call(ctx, 'subscribe', { group: 'g' }), { group: 'g', partitions: [0, 1] })
    const polled = call(ctx, 'poll', { group: 'g', max: 10 })
    assert.deepEqual(
      polled.map((/** @type {any} */ m) => m.body.n),
      [1, 2]
    )
    assert.deepEqual(call(ctx, 'poll', { group: 'g', max: 10 }), [], 'the position moved on')
    assert.deepEqual(call(ctx, 'commit', { group: 'g' }), { ok: true })
    assert.equal(call(ctx, 'poll', { group: 'nobody' }).code, 'UNKNOWN_GROUP')
    assert.equal(call(ctx, 'commit', { group: 'nobody' }).code, 'UNKNOWN_GROUP')
    assert.equal(
      call(ctx, 'commit', { group: 'g', partition: a1.partition, offset: 99 }).code,
      'OFFSET_OUT_OF_RANGE'
    )

    const roundRobin = topic({ partitions: 2 })
    const spread = [1, 2, 3, 4].map(n => call(roundRobin, 'publish', { n }).partition)
    assert.deepEqual(spread, [0, 1, 0, 1], 'without a key, partitions take turns')
  })

  it('reports consumer lag per consumer group', () => {
    const ctx = topic({ partitions: 1, consumerGroups: ['billing', 'search'] })
    for (const n of [1, 2, 3]) {
      ctx.now = n * 1000
      call(ctx, 'publish', { n })
    }
    ctx.now = 5000
    call(ctx, 'poll', { group: 'billing', max: 2 })
    call(ctx, 'commit', { group: 'billing' })
    assert.equal(last(ctx, 'consumerLag.billing'), 1)
    assert.equal(last(ctx, 'consumerLag.search'), 3)
    assert.equal(last(ctx, 'consumerLagTime.billing'), 2, 'its oldest unread message is 2 s old')
    assert.equal(last(ctx, 'consumerLagTime.search'), 4)
  })

  it('keeps messages for its retention time and size, and compaction keeps the latest per key', () => {
    const byTime = topic({ partitions: 1, retentionTime: '10s' })
    call(byTime, 'publish', 'old')
    byTime.now = 6000
    call(byTime, 'publish', 'newer')
    byTime.now = 12_000
    call(byTime, 'publish', 'newest')
    call(byTime, 'subscribe', { group: 'g' })
    assert.deepEqual(
      call(byTime, 'poll', { group: 'g', max: 10 }).map((/** @type {any} */ m) => [
        m.offset,
        m.body,
      ]),
      [
        [1, 'newer'],
        [2, 'newest'],
      ]
    )

    const bySize = topic({ partitions: 1, retentionSize: '250B', replicationFactor: 3 })
    for (const n of [1, 2, 3]) call(bySize, 'publish', n)
    assert.equal(last(bySize, 'retainedBytes'), 600, 'two 100-byte messages on three replicas')

    const compacted = topic({ partitions: 1, compaction: true, orderingKey: 'k' })
    call(compacted, 'publish', { k: 'a', v: 1 })
    call(compacted, 'publish', { k: 'b', v: 1 })
    call(compacted, 'publish', { k: 'a', v: 2 })
    call(compacted, 'subscribe', { group: 'g' })
    assert.deepEqual(
      call(compacted, 'poll', { group: 'g', max: 10 }).map((/** @type {any} */ m) => [
        m.offset,
        m.body,
      ]),
      [
        [1, { k: 'b', v: 1 }],
        [2, { k: 'a', v: 2 }],
      ]
    )
  })

  it('commits as it polls when delivery is at most once, and drops duplicates when exactly once', () => {
    const atMostOnce = topic({
      partitions: 1,
      deliverySemantics: 'at-most-once',
      consumerGroups: ['g'],
    })
    call(atMostOnce, 'publish', 1)
    call(atMostOnce, 'poll', { group: 'g' })
    assert.equal(last(atMostOnce, 'consumerLag.g'), 0)

    const exactlyOnce = topic({ partitions: 1, deliverySemantics: 'exactly-once' })
    const first = call(exactlyOnce, 'publish', { dedupId: 'x' })
    assert.deepEqual(call(exactlyOnce, 'publish', { dedupId: 'x' }), { ...first, duplicate: true })
  })

  it('throttles a partition above its throughput', () => {
    const ctx = topic({ partitions: 1, throughputPerPartition: 0.001 })
    const replies = Array.from({ length: 11 }, (_, n) => call(ctx, 'publish', n))
    assert.equal(replies[9].partition, 0, 'ten 100-byte messages fit in 1,000 B/s')
    assert.equal(replies[10].code, 'PARTITION_THROTTLED')
    ctx.now = 500
    assert.equal(call(ctx, 'publish', 'later').partition, 0, 'half a second refills 500 B')
  })

  it('reports its publish rate, partition skew and retained bytes', () => {
    const ctx = topic({ partitions: 2, orderingKey: 'k', replicationFactor: 1 })
    for (const n of [1, 2, 3, 4]) call(ctx, 'publish', { k: 'same', n })
    assert.deepEqual(
      ctx.metrics
        .filter((/** @type {any} */ m) => m.name === 'publishRate')
        .map((/** @type {any} */ m) => m.value),
      [1, 1, 1, 1]
    )
    assert.equal(last(ctx, 'partitionSkew'), 1, 'one partition holds twice the mean')
    assert.equal(last(ctx, 'retainedBytes'), 400)
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
