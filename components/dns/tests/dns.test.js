// @ts-check
// Self-tests of the starter DNS (task 0426, spec §9): records are the edges leaving its out port;
// health checks take a record out of its answers and fail over to the next; a resolver keeps an
// answer for the record TTL; and the simple, weighted, geo and failover routing policies.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTestContext, runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A DNS in the kernel whose records point at `targets`.
 * @param {Record<string, unknown>} props
 * @param {{ targets?: string[], replies?: Record<string, unknown>, edges?: Record<string, Record<string, unknown>> }} [stubs]
 */
function dns(props, { targets = ['primary', 'secondary'], replies = {}, edges } = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { resolutionLatency: { kind: 'constant', value: 5 }, ...props },
    targets: { out: targets },
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

/** A lookup of `name` by `client` at `atMs`. @param {any} api */
const resolve = (api, atMs = 0, client = '10.0.0.1', name = 'shop.example.com') =>
  api.call('resolve', { name }, { atMs, headers: { 'X-Forwarded-For': client } })

/** The addresses answered. @param {any[]} replies */
const addresses = replies => replies.map(r => r.body?.address ?? r.error?.code)

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

/** Health replies that pass, except for checks `from` to `to`, counted from 1. */
function outage(/** @type {number} */ from, /** @type {number} */ to) {
  let checks = 0
  return () => {
    checks++
    if (checks >= from && checks <= to)
      throw Object.assign(new Error('unhealthy'), { code: 'UNHEALTHY' })
    return { status: 'up' }
  }
}

describe('DNS', () => {
  it('stops answering with a record whose health check fails, and fails over to the next', async () => {
    const api = dns(
      { routingPolicy: 'failover', healthCheckInterval: '1s', recordTtl: '60s' },
      { replies: { 'primary.health': outage(3, 5) } }
    )
    const before = resolve(api, 500, '10.0.0.1')
    const during = [resolve(api, 5500, '10.0.0.2'), resolve(api, 7500, '10.0.0.3')]
    const after = resolve(api, 8500, '10.0.0.4')
    await api.runUntil(9000)
    assert.deepEqual(addresses([before]), ['primary'])
    assert.deepEqual(
      addresses(during),
      ['secondary', 'secondary'],
      'the primary failed its checks at 3, 4 and 5 s'
    )
    assert.deepEqual(addresses([after]), ['primary'], 'and passed three again by 8 s')
    const events = series(api, 'failoverEvents')
    assert.equal(events.length, 2)
    assert.ok(events[0][0] >= 5000 && events[0][0] < 5500, `failed over at ${events[0][0]} ms`)
    assert.ok(events[1][0] >= 8000 && events[1][0] < 8500, `failed back at ${events[1][0]} ms`)
  })

  it('keeps answering a resolver with what it cached for the record TTL, without resolution latency', async () => {
    const api = dns(
      { routingPolicy: 'failover', healthCheckInterval: '1s', recordTtl: '10s' },
      { replies: { 'primary.health': outage(3, 100) } }
    )
    const cached = [500, 6000, 10_000, 10_600].map(at => resolve(api, at, '10.0.0.1'))
    const other = resolve(api, 6000, '10.0.0.2')
    await api.runUntil(12_000)
    assert.deepEqual(
      addresses(cached),
      ['primary', 'primary', 'primary', 'secondary'],
      'the cached answer outlives the failover until 10.5 s'
    )
    assert.deepEqual(addresses([other]), ['secondary'])
    assert.deepEqual(
      cached.map(r => r.atUs / MS),
      [505, 6000, 10_000, 10_605],
      'a cached answer takes no resolution latency'
    )
    assert.equal(series(api, 'queries').length, 5)
  })

  it('answers by the edges’ weights when weighted, by the client when geo, and at random when simple', async () => {
    /** @param {string} routingPolicy */
    const shares = async routingPolicy => {
      const api = dns(
        { routingPolicy, recordTtl: '0s' },
        {
          targets: ['a', 'b'],
          edges: { 'out:a': { route: ['weight 3'] } },
        }
      )
      const replies = Array.from({ length: 400 }, (_, i) => resolve(api, i * 10, `10.0.${i % 8}.1`))
      await api.runUntil(10_000)
      const answers = addresses(replies)
      return {
        a: answers.filter(x => x === 'a').length,
        byClient: Array.from(
          { length: 8 },
          (_, c) => new Set(answers.filter((_, i) => i % 8 === c)).size
        ),
      }
    }
    const weighted = await shares('weighted')
    assert.ok(Math.abs(weighted.a - 300) < 30, `${weighted.a} of 400 answers are a`)
    const geo = await shares('geo')
    assert.deepEqual(geo.byClient, Array(8).fill(1), 'each client always gets the same record')
    assert.ok(geo.a > 0 && geo.a < 400, 'and the clients are spread over both')
    const simple = await shares('simple')
    assert.ok(Math.abs(simple.a - 200) < 30, `${simple.a} of 400 answers are a`)
  })

  it('answers NXDOMAIN when it has no records', async () => {
    const ctx = createTestContext({ manifest, behaviour, targets: { out: [] } })
    const reply = await behaviour.public.resolve({ body: { name: 'shop.example.com' } }, ctx)
    assert.deepEqual(reply, ctx.fail('NXDOMAIN', { name: 'shop.example.com' }))
    for (const { code } of ctx.failures) covered.errors.add(code)
    for (const { name } of ctx.metrics) covered.metrics.add(name)
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
