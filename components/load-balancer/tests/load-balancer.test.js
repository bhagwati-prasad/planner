// @ts-check
// Self-tests of the starter load balancer (task 0421, spec §9, ADR 0022): each algorithm picks a
// healthy target of those its out port reaches; health checks take a target out after its
// unhealthy threshold and back after its healthy threshold; sticky sessions and layer 4 keep a
// client on its target until it is idle for idleTimeout; and maxConnections rejects the rest.
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
 * A balancer in the kernel in front of `targets`, each of which answers with its own name.
 * @param {Record<string, unknown>} props
 * @param {{ targets?: string[], replies?: Record<string, unknown>, edges?: Record<string, Record<string, unknown>> }} [stubs]
 */
function balancer(props, { targets = ['a', 'b', 'c'], replies = {}, edges } = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { processingLatency: { kind: 'constant', value: 0 }, ...props },
    targets: { out: targets },
    replies: { out: (/** @type {unknown} */ _, /** @type {any} */ { node }) => node, ...replies },
    edges,
  })
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

/** A request from `client` at `atMs`. @param {any} api */
const send = (api, atMs = 0, client = '10.0.0.1') =>
  api.call(
    'forward',
    { order: 1 },
    { atMs, path: '/orders', headers: { 'X-Forwarded-For': client } }
  )

/** The targets that answered. @param {any[]} replies */
const answered = replies => replies.map(r => r.body ?? r.error?.code)

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

/** Health replies that fail for the first `n` checks. @param {number} n */
function failing(n) {
  let checks = 0
  return () => {
    if (++checks <= n) throw Object.assign(new Error('unhealthy'), { code: 'UNHEALTHY' })
    return { status: 'up' }
  }
}

describe('load balancer', () => {
  it('spreads requests round-robin, and stops sending to a target that fails its unhealthy threshold of checks', async () => {
    const api = balancer(
      { healthCheckInterval: '1s', unhealthyThreshold: 2, healthyThreshold: 2 },
      { replies: { 'b.health': failing(2) } }
    )
    const first = Array.from({ length: 6 }, () => send(api))
    const without = Array.from({ length: 4 }, () => send(api, 3000))
    const back = Array.from({ length: 3 }, () => send(api, 4500))
    await api.runUntil(5000)
    assert.deepEqual(answered(first), ['a', 'b', 'c', 'a', 'b', 'c'])
    assert.deepEqual(answered(without), ['a', 'c', 'a', 'c'], 'b failed checks at 1 s and 2 s')
    assert.deepEqual(answered(back), ['b', 'c', 'a'], 'b passed checks at 3 s and 4 s')
    assert.deepEqual(series(api, 'unhealthyTargets'), [
      [2000, 1],
      [4000, 0],
    ])
  })

  it('sends to the target with the fewest open requests, taking ties in turn', async () => {
    const api = balancer(
      { algorithm: 'least-connections' },
      { edges: { 'out:a': { latency: 100 } } }
    )
    const replies = [0, 10, 20, 30].map(at => send(api, at))
    await api.runUntil(1000)
    assert.deepEqual(answered(replies), ['a', 'c', 'b', 'c'], 'a stays busy until 200 ms')
  })

  it('spreads requests by the weights of the edges, smoothly', async () => {
    const api = balancer(
      { algorithm: 'weighted' },
      { targets: ['a', 'b'], edges: { 'out:a': { route: ['weight 3'] } } }
    )
    const replies = Array.from({ length: 8 }, () => send(api))
    await api.runUntil(1000)
    assert.deepEqual(answered(replies), ['a', 'a', 'b', 'a', 'a', 'a', 'b', 'a'])
  })

  it('hashes each client to a target, and with a consistent hash moves only the clients of a target that leaves', async () => {
    const clients = Array.from({ length: 30 }, (_, i) => `10.0.1.${i}`)
    const ip = balancer({ algorithm: 'ip-hash' })
    const once = clients.map(c => send(ip, 0, c))
    const twice = clients.map(c => send(ip, 100, c))
    await ip.runUntil(1000)
    assert.deepEqual(answered(twice), answered(once), 'each client keeps its target')
    assert.equal(new Set(answered(once)).size, 3, 'clients spread over every target')

    const ring = balancer(
      { algorithm: 'consistent-hash', healthCheckInterval: '1s', unhealthyThreshold: 1 },
      { replies: { 'c.health': failing(10) } }
    )
    const before = clients.map(c => send(ring, 0, c))
    const after = clients.map(c => send(ring, 1500, c))
    await ring.runUntil(2000)
    const [was, now] = [answered(before), answered(after)]
    assert.ok(was.includes('c'), 'c had clients')
    clients.forEach((_, i) => {
      if (was[i] === 'c') assert.notEqual(now[i], 'c')
      else assert.equal(now[i], was[i], `client ${i} stays on ${was[i]}`)
    })
  })

  it('keeps a client on its target with sticky sessions, or at layer 4, until it is idle for idleTimeout', async () => {
    const sticky = balancer({ stickySessions: true, idleTimeout: '10s' })
    const replies = [
      send(sticky, 0, 'x'),
      send(sticky, 1, 'y'),
      send(sticky, 5000, 'x'),
      send(sticky, 30_000, 'x'),
    ]
    await sticky.runUntil(40_000)
    assert.deepEqual(answered(replies), ['a', 'b', 'a', 'c'])

    const l4 = balancer({ layer: 'l4', idleTimeout: '10s' })
    const connection = [0, 1, 2].map(at => send(l4, at, 'x'))
    await l4.runUntil(1000)
    assert.deepEqual(answered(connection), ['a', 'a', 'a'], 'one connection, one target')
  })

  it('rejects connections over its maximum, and fails without a healthy target or when the target fails', async () => {
    const full = balancer({ maxConnections: 2 }, { edges: { out: { latency: 100 } } })
    const replies = [send(full), send(full), send(full)]
    await full.runUntil(1000)
    assert.deepEqual(answered(replies), ['a', 'b', 'CONNECTION_REJECTED'])
    assert.deepEqual(series(full, 'rejectedConnections'), [[0, 1]])
    assert.equal(Math.max(...series(full, 'activeConnections').map(([, n]) => n)), 2)

    const sick = balancer(
      { healthCheckInterval: '1s', unhealthyThreshold: 1 },
      { targets: ['a'], replies: { 'a.health': failing(10) } }
    )
    const none = send(sick, 1500)
    const down = balancer(
      {},
      {
        targets: ['a'],
        replies: {
          out: () => {
            throw Object.assign(new Error('down'), { code: 'DOWN' })
          },
        },
      }
    )
    const failed = send(down)
    await sick.runUntil(2000)
    await down.runUntil(1000)
    assert.equal(none.error?.code, 'NO_HEALTHY_TARGET')
    assert.deepEqual(
      [failed.error?.code, failed.error?.details],
      ['BAD_GATEWAY', { code: 'DOWN', node: 'a' }]
    )
    assert.ok(series(down, 'requestsPerTarget.a').length > 0, 'it counts requests per target')
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
