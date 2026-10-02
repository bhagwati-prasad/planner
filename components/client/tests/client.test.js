// @ts-check
// Self-tests of the starter client (task 0428, spec §9, §11 "Sources and load"): sessions run
// multi-step scenarios that extract variables from responses and reuse them in later paths,
// headers and bodies; steps retry after a backoff, time out, and lose requests on the client's
// own network; the scenario mix picks scenarios for users of its population; and without
// scenarios, each session sends a request after each think time.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { metrics: new Set() }

const constant = (/** @type {number} */ value) => ({ kind: 'constant', value })

/**
 * A client in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} props
 * @param {{ targets?: Record<string, string[]>, replies?: Record<string, unknown>, edges?: Record<string, Record<string, unknown>> }} [stubs]
 */
function client(props, { targets, replies = {}, edges } = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: {
      concurrency: 1,
      thinkTime: constant(1000),
      networkLatency: constant(10),
      networkBandwidth: 0,
      packetLoss: 0,
      ...props,
    },
    targets,
    replies,
    edges,
  })
  const run = api.runUntil
  api.runUntil = async ms => {
    await run(ms)
    for (const m of api.metrics) covered.metrics.add(m.name)
  }
  return api
}

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

/** Every attempt the client sent, as [ms it left, the node it reached]. @param {any} api */
const sends = api =>
  api.spans
    .filter((/** @type {any} */ s) => s.kind === 'send' && s.node === 'it')
    .map((/** @type {any} */ s) => [s.startUs / MS, s.edge.split(':')[1]])

/** A reply function that fails its first `n` calls, and records every body it gets. */
function flaky(/** @type {number} */ n, /** @type {unknown[]} */ seen = []) {
  return (/** @type {unknown} */ body) => {
    seen.push(body)
    if (seen.length <= n) throw Object.assign(new Error('busy'), { code: 'UNAVAILABLE' })
    return { ok: true }
  }
}

describe('client', () => {
  it('runs a multi-step scenario that extracts a token and reuses it', async () => {
    /** @type {unknown[]} */
    const listed = []
    const api = client(
      {
        scenarios: {
          orders: [
            {
              call: 'out.login',
              path: '/login',
              body: { user: 'ada' },
              extract: { token: '$.token', userId: '$.user.id', first: '$.roles[0]' },
              think: 0,
            },
            {
              call: 'out.listOrders',
              path: '/orders/${userId}',
              headers: { Authorization: 'Bearer ${token}' },
              body: { userId: '${userId}', note: '${first} ${userId}' },
            },
          ],
        },
      },
      {
        targets: { out: ['auth', 'orders'] },
        edges: {
          out: { latency: 0 },
          'out:auth': { route: ['path /login'] },
          'out:orders': { route: ['path /orders/7', 'header authorization = Bearer t-ada'] },
        },
        replies: {
          'auth.login': (/** @type {any} */ body) => ({
            token: `t-${body.user}`,
            user: { id: 7 },
            roles: ['admin', 'buyer'],
          }),
          'orders.listOrders': (/** @type {unknown} */ body) => (listed.push(body), [1, 2]),
        },
      }
    )
    await api.runUntil(2000)
    assert.deepEqual(
      sends(api),
      [
        [10, 'auth'],
        [20, 'orders'],
        [1030, 'auth'],
        [1040, 'orders'],
      ],
      'the orders call routes only with the token in its header and the user id in its path'
    )
    assert.deepEqual(listed[0], { userId: 7, note: 'admin 7' }, 'a whole ${var} keeps its type')
    assert.equal(series(api, 'requestsSent').length, 4)
    assert.equal(series(api, 'success').at(-1)?.[1], 1)
    const p99 = /** @type {number} */ (series(api, 'endToEnd.p99').at(-1)?.[1])
    assert.ok(p99 >= 10 && p99 < 10.7, `p99 of 10 ms steps is ${p99}`)
  })

  it('retries a failed step after its backoff, and abandons the scenario when its retries run out', async () => {
    /** @type {unknown[]} */
    const seen = []
    const api = client(
      {
        retries: 1,
        retryBackoff: '500ms',
        scenarios: { buy: [{ call: 'out.pay', body: { amount: 5 } }, { call: 'out.ship' }] },
      },
      { edges: { out: { latency: 0 } }, replies: { 'out.pay': flaky(2, seen), 'out.ship': {} } }
    )
    await api.runUntil(3000)
    assert.deepEqual(
      sends(api).map(([at]) => at),
      [10, 520, 1530, 2540],
      'pay fails twice, gives up, thinks, then pays, thinks and ships'
    )
    assert.deepEqual(
      series(api, 'success').map(([, v]) => v),
      [0, 0.5, 2 / 3]
    )
  })

  it('times out at the client timeout, and loses requests at its packet loss', async () => {
    const slow = client(
      { clientTimeout: '1s', retries: 0, scenarios: { s: [{ call: 'out.get' }] } },
      { edges: { out: { latency: 3000, timeout: 60_000 } }, replies: { 'out.get': {} } }
    )
    await slow.runUntil(3500)
    assert.deepEqual(
      series(slow, 'timeouts').map(([at]) => at),
      [1000, 3000],
      'each try gives up a second after it started, then the session thinks for a second'
    )

    /** @type {unknown[]} */
    const reached = []
    const lossy = client(
      { clientTimeout: '1s', retries: 0, packetLoss: 50, scenarios: { s: [{ call: 'out.get' }] } },
      { replies: { 'out.get': (/** @type {unknown} */ b) => (reached.push(b), {}) } }
    )
    await lossy.runUntil(200_000)
    const sent = series(lossy, 'requestsSent').length
    const lost = series(lossy, 'timeouts').length
    assert.equal(reached.length + lost, sent)
    assert.ok(Math.abs(lost / sent - 0.5) < 0.1, `${lost} of ${sent} lost`)
  })

  it('picks scenarios by the scenario mix, for users of its population', async () => {
    /** @type {number[]} */
    const users = []
    const step = (/** @type {string} */ method) => [
      { call: `out.${method}`, body: { user: '${user}' } },
    ]
    const api = client(
      {
        concurrency: 4,
        population: 3,
        thinkTime: constant(100),
        scenarioMix: { browse: 75, buy: 25 },
        scenarios: { browse: step('browse'), buy: step('buy') },
      },
      {
        replies: {
          'out.browse': (/** @type {any} */ b) => (users.push(b.user), {}),
          'out.buy': (/** @type {any} */ b) => (users.push(b.user), {}),
        },
      }
    )
    await api.runUntil(20_000)
    const browse = api.spans.filter(
      (/** @type {any} */ s) => s.kind === 'public' && s.method === 'browse'
    ).length
    assert.ok(Math.abs(browse / users.length - 0.75) < 0.05, `${browse} of ${users.length} browse`)
    assert.deepEqual([...new Set(users)].sort(), [1, 2, 3])
  })

  it('sends each request after its network latency and its body at its network bandwidth', async () => {
    const api = client(
      {
        networkBandwidth: 0.008,
        scenarios: { upload: [{ call: 'out.put', body: { data: 'x'.repeat(89) } }] },
      },
      { edges: { out: { latency: 0 } }, replies: { 'out.put': {} } }
    )
    await api.runUntil(500)
    assert.deepEqual(sends(api), [[110, 'out']], '100 bytes at 1000 bytes a second, after 10 ms')
  })

  it('sends a request on out after each think time when it has no scenarios', async () => {
    const api = client({ concurrency: 2, networkLatency: constant(0) })
    await api.runUntil(3500)
    assert.equal(series(api, 'requestsSent').length, 8, 'two sessions at 0, 1, 2 and 3 s')
  })

  it('reports every metric it declares', () => {
    for (const name of Object.keys(manifest.metrics))
      assert.ok(covered.metrics.has(name), `reports ${name}`)
  })
})
