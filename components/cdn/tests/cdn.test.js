// @ts-check
// Self-tests of the starter CDN (task 0426, spec §9): repeated gets answered from the edge cache,
// a miss fetched from the origin once per TTL, through the origin shield once for every edge
// location or once per location without it, keys drawn by popularity skew or a fixed hit ratio,
// egress, and origin failures and timeouts.
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
 * A CDN in the kernel in front of an origin that answers each fetch with its count.
 * @param {Record<string, unknown>} props
 * @param {{ origin?: (body: unknown) => unknown, edges?: Record<string, Record<string, unknown>> }} [stubs]
 */
function cdn(props, { origin, edges } = {}) {
  const fetches = { count: 0 }
  const api = runComponent({
    manifest,
    behaviour,
    props: { edgeLatency: constant(5), ...props },
    replies: { out: origin ?? (() => ({ version: ++fetches.count })) },
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
  return Object.assign(api, { fetches })
}

/** A get of `path` from `client` at `atMs`. @param {any} api */
const get = (api, path, atMs = 0, client = '10.0.0.1', sizeBytes = 1_000_000) =>
  api.call('get', null, { atMs, path, headers: { 'X-Forwarded-For': client }, sizeBytes })

/** A reply's body, or its error's code. @param {any} reply */
const outcome = reply => (reply.status === 'ok' ? reply.body : reply.error?.code)

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

describe('CDN', () => {
  it('answers repeated gets from its edge cache, and fetches a miss from its origin once per TTL', async () => {
    const api = cdn({ cacheTtl: '10s', originShield: false })
    const first = Array.from({ length: 10 }, (_, i) => get(api, '/logo.png', i * 1000))
    const later = [10_500, 12_000, 15_000].map(at => get(api, '/logo.png', at))
    const other = get(api, '/app.js', 3000)
    await api.runUntil(20_000)
    assert.deepEqual(first.map(outcome), Array(10).fill({ version: 1 }))
    assert.deepEqual(outcome(other), { version: 2 }, 'another object is fetched on its own')
    assert.deepEqual(later.map(outcome), Array(3).fill({ version: 3 }), 'the copy expired at 10 s')
    assert.equal(api.fetches.count, 3)
    assert.equal(series(api, 'originRequests').length, 3)
    assert.equal(series(api, 'hitRatio').at(-1)?.[1], 11 / 14)
    assert.deepEqual(
      [...new Set(series(api, 'egress').map(([, gb]) => gb))],
      [0.001],
      'each response sends its megabyte'
    )
    assert.deepEqual([...new Set(series(api, 'edgeLatency').map(([, ms]) => ms))], [5])
  })

  it('fetches an object from its origin once through its shield, and once per edge location without it', async () => {
    /** @param {boolean} originShield */
    const fetches = async originShield => {
      const api = cdn({ edgeLocations: 4, originShield })
      const replies = Array.from({ length: 40 }, (_, i) =>
        get(api, '/video.mp4', i * 100, `10.0.0.${i}`)
      )
      await api.runUntil(10_000)
      assert.ok(replies.every(r => r.status === 'ok'))
      return { count: api.fetches.count, hitRatio: series(api, 'hitRatio').at(-1)?.[1] }
    }
    const shielded = await fetches(true)
    const unshielded = await fetches(false)
    assert.equal(shielded.count, 1, 'the shield fills every edge location')
    assert.equal(unshielded.count, 4, 'each edge location fetches its own copy')
    assert.equal(shielded.hitRatio, 36 / 40, 'each edge location misses once either way')
    assert.equal(unshielded.hitRatio, 36 / 40)
  })

  it('draws keys by popularity skew, so a skewed keyspace hits more often than a uniform one', async () => {
    /** @param {Record<string, unknown>} props */
    const hitRatio = async props => {
      const api = cdn({
        edgeLocations: 1,
        keyspaceSize: 1000,
        cacheTtl: '1h',
        originShield: false,
        ...props,
      })
      Array.from({ length: 2000 }, (_, i) => api.call('get', null, { atMs: i * 5 }))
      await api.runUntil(20_000)
      return {
        ratio: /** @type {number} */ (series(api, 'hitRatio').at(-1)?.[1]),
        fetches: api.fetches.count,
      }
    }
    const skewed = await hitRatio({ popularitySkew: 1.1 })
    const uniform = await hitRatio({ popularitySkew: 0 })
    assert.ok(skewed.ratio > uniform.ratio + 0.15, `${skewed.ratio} against ${uniform.ratio}`)
    assert.ok(uniform.ratio > 0.4 && uniform.ratio < 0.7, `uniform hit ratio ${uniform.ratio}`)
    const fixed = await hitRatio({ fixedHitRatio: 80 })
    assert.ok(Math.abs(fixed.ratio - 0.8) < 0.03, `fixed hit ratio ${fixed.ratio}`)
    assert.ok(Math.abs(fixed.fetches - 400) < 60, `${fixed.fetches} origin fetches`)
  })

  it('answers BAD_GATEWAY when its origin fails, and ORIGIN_TIMEOUT when it is slower than the origin timeout', async () => {
    const failing = cdn(
      {},
      {
        origin: () => {
          throw Object.assign(new Error('down'), { code: 'UNAVAILABLE' })
        },
      }
    )
    const failed = get(failing, '/a')
    await failing.runUntil(1000)
    assert.equal(outcome(failed), 'BAD_GATEWAY')
    assert.deepEqual(failed.error?.details, { code: 'UNAVAILABLE' })

    const slow = cdn(
      { originTimeout: '1s' },
      { edges: { out: { latency: 3000, timeout: 60_000 } } }
    )
    const timedOut = get(slow, '/a')
    await slow.runUntil(10_000)
    assert.equal(outcome(timedOut), 'ORIGIN_TIMEOUT')
    assert.equal(
      timedOut.atUs,
      1010 * MS,
      'it gives up a second after the shield, one hop past the edge, started fetching'
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
