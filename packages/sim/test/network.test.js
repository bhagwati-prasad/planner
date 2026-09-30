// @ts-check
// Edges, routing and the network model (task 0405, spec §11 "Routing and resources", §9
// "Connection types", ADR 0019): every edge adds latency, transmission delay and loss; requests
// time out and are retried with backoff and jitter; and rules choose which edge leaving a port
// carries a message.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as sim from '../src/index.js'

const MS = 1000
const S = 1_000_000
const constant = (/** @type {number} */ ms) => ({ kind: 'constant', value: ms })

/**
 * The client: `go` sends msg.body's `{ method, body, options }` on port `out` and returns the
 * response, or the error's code and message; `fire` emits it without waiting.
 */
const client = {
  id: 'client',
  manifest: {
    strataApi: '^1.0',
    id: 't.client',
    name: 'Client',
    version: '1.0.0',
    extends: 'base:client',
    ports: [
      { name: 'in', direction: 'in', exposes: ['go', 'fire'] },
      { name: 'out', direction: 'out' },
    ],
    methods: { public: { go: {}, fire: {} } },
  },
  behaviour: {
    public: {
      async go(/** @type {any} */ msg, /** @type {any} */ ctx) {
        const { method = 'get', body, options } = msg.body ?? {}
        try {
          return await ctx.send('out', method, body, options)
        } catch (err) {
          const { code, message } = /** @type {any} */ (err)
          return { code, message }
        }
      },
      fire(/** @type {any} */ msg, /** @type {any} */ ctx) {
        const { method = 'get', body, options } = msg.body ?? {}
        ctx.emit('out', method, body, options)
      },
    },
  },
}

const METHODS = ['get', 'purge', 'report', 'audit']

/**
 * A server whose port `in` exposes every method in METHODS; each answers with the server's name
 * and what it saw of the message. With `thinkMs`, a call takes that long whenever `slow(msg)`.
 * @param {string} name
 * @param {{ thinkMs?: number, slow?: (msg: any) => boolean, seen?: any[] }} [options]
 */
function server(name, { thinkMs = 0, slow = () => true, seen = [] } = {}) {
  /** @param {any} msg @param {any} ctx */
  const answer = (msg, ctx) => {
    seen.push(msg)
    if (thinkMs && slow(msg)) ctx.call('think')
    return { at: name, path: msg.path, headers: msg.headers, sizeBytes: msg.sizeBytes }
  }
  return {
    id: name,
    manifest: {
      strataApi: '^1.0',
      id: `t.${name}`,
      name,
      version: '1.0.0',
      extends: 'base:service',
      ports: [{ name: 'in', direction: 'in', exposes: METHODS }],
      methods: {
        public: Object.fromEntries(METHODS.map(m => [m, {}])),
        private: { think: { latency: constant(thinkMs) } },
      },
    },
    behaviour: {
      public: Object.fromEntries(METHODS.map(m => [m, answer])),
      private: { think() {} },
    },
  }
}

/**
 * A run of the client and servers, with an edge from the client's `out` to each `to`.
 * @param {object[]} servers
 * @param {{ to: string, method?: string, props?: object }[]} edges
 * @param {number} [seed]
 */
function network(servers, edges, seed = 1) {
  return sim.createRun({
    seed,
    nodes: /** @type {any} */ ([client, ...servers]),
    edges: edges.map(({ to, method, props = {} }, i) => ({
      id: `e${i + 1}`,
      from: { node: 'client', port: 'out' },
      to: { node: to, port: 'in' },
      method: method ?? null,
      props,
    })),
  })
}

/** Asks the client to send `args` at `atUs`. @param {any} run @param {object} [args] */
const go = (run, args = {}, atUs = 0) =>
  run.inject({ node: 'client', port: 'in', method: 'go', body: args, atUs })

/** The spans of the client's sends: one per attempt. @param {any} run */
const attempts = run =>
  run.spans
    .filter((/** @type {any} */ s) => s.kind === 'send')
    .map((/** @type {any} */ s) => [s.attempt, s.startUs, s.endUs, s.status, s.code])

describe('edges and the network model', () => {
  it('delays each message by its payload size divided by the bandwidth, on top of latency', async () => {
    // 125,000 B at 1 Mbps take 1 s; a message may carry its own size.
    const props = { latency: 5, bandwidth: 1_000_000, payloadSize: 125_000 }
    const run = network([server('api')], [{ to: 'api', props }])
    const small = go(run)
    const large = go(run, { options: { sizeBytes: 250_000 } }, 10 * S)
    await run.runToEnd()
    const arrivals = run.spans.filter(s => s.node === 'api').map(s => s.startUs)
    assert.deepEqual(arrivals, [S + 5 * MS, 10 * S + 2 * S + 5 * MS])
    assert.deepEqual([small.atUs, small.body.sizeBytes], [2 * S + 10 * MS, 125_000])
    assert.deepEqual([large.atUs, large.body.sizeBytes], [13 * S + 10 * MS, 250_000])
  })

  it('samples each crossing’s latency from the edge’s distribution, the same way for the same seed', async () => {
    const arrivals = async (/** @type {number} */ seed) => {
      const props = { latency: { kind: 'uniform', min: 1, max: 3 } }
      const run = network([server('api')], [{ to: 'api', props }], seed)
      for (let i = 0; i < 100; i++)
        run.inject({ node: 'client', port: 'in', method: 'fire', atUs: i * 10 * MS })
      await run.runToEnd()
      return run.spans.filter(s => s.node === 'api').map((s, i) => s.startUs - i * 10 * MS)
    }
    const first = await arrivals(1)
    assert.ok(
      first.every(us => us >= 1 * MS && us <= 3 * MS && Number.isInteger(us)),
      'whole µs within the distribution'
    )
    assert.ok(new Set(first).size > 50, 'each crossing draws its own latency')
    assert.deepEqual(await arrivals(1), first)
    assert.notDeepEqual(await arrivals(2), first)
  })

  it('splits 10,000 seeded requests by the edges’ weights, within tolerance', async () => {
    const split = async (/** @type {number} */ seed) => {
      const run = network(
        [server('a'), server('b')],
        [
          { to: 'a', props: { route: ['weight 30'] } },
          { to: 'b', props: { route: ['weight 70'] } },
        ],
        seed
      )
      for (let i = 0; i < 10_000; i++)
        run.inject({ node: 'client', port: 'in', method: 'fire', atUs: i })
      await run.runToEnd()
      return run.spans.filter(s => s.node !== 'client').map(s => s.node)
    }
    const first = await split(1)
    const toA = first.filter(n => n === 'a').length
    assert.equal(first.length, 10_000)
    // One standard deviation is √(10,000 × 0.3 × 0.7) ≈ 46 requests.
    assert.ok(Math.abs(toA - 3000) < 200, `${toA} of 10,000 went to a`)
    assert.deepEqual(await split(1), first, 'the same seed splits the same way')
    assert.notDeepEqual(await split(2), first, 'another seed splits differently')
  })

  it('retries a request that times out after the configured backoff, and every attempt appears in the trace', async () => {
    const props = { timeout: 50, retries: 2, retryBackoff: 100, retryJitter: 0 }
    /** @type {any[]} */
    const seen = []
    const slow = network([server('api', { thinkMs: 200, seen })], [{ to: 'api', props }])
    const gaveUp = go(slow)
    await slow.runToEnd()
    // Timeouts at 50, 200 and 450 ms; retries 100 ms and 200 ms after them.
    assert.equal(gaveUp.body.code, 'E_SIM_TIMEOUT')
    assert.match(gaveUp.body.message, /3 attempts/)
    assert.equal(gaveUp.atUs, 450 * MS)
    assert.deepEqual(attempts(slow), [
      [1, 0, 50 * MS, 'error', 'E_SIM_TIMEOUT'],
      [2, 150 * MS, 200 * MS, 'error', 'E_SIM_TIMEOUT'],
      [3, 400 * MS, 450 * MS, 'error', 'E_SIM_TIMEOUT'],
    ])
    const caller = slow.spans.find(s => s.method === 'go')
    for (const s of slow.spans.filter(s => s.kind === 'send'))
      assert.deepEqual(
        [s.node, s.method, s.edge, s.parentSpanId],
        ['client', 'get', 'e1', caller?.spanId]
      )
    assert.deepEqual(
      seen.map(m => m.attempt),
      [1, 2, 3],
      'the server saw every attempt'
    )

    let calls = 0
    const flaky = network(
      [server('api', { thinkMs: 200, slow: () => ++calls < 3 })],
      [{ to: 'api', props }]
    )
    const third = go(flaky)
    await flaky.runToEnd()
    assert.deepEqual([third.atUs, third.body.at], [400 * MS, 'api'], 'the third attempt answered')
    assert.deepEqual(attempts(flaky), [
      [1, 0, 50 * MS, 'error', 'E_SIM_TIMEOUT'],
      [2, 150 * MS, 200 * MS, 'error', 'E_SIM_TIMEOUT'],
      [3, 400 * MS, 400 * MS, 'ok', undefined],
    ])
  })

  it('spreads retries by the configured jitter, the same way for the same seed', async () => {
    const gaps = async (/** @type {number} */ seed) => {
      const props = { timeout: 50, retries: 3, retryBackoff: 100, retryJitter: 0.5 }
      const run = network([server('api', { thinkMs: 1000 })], [{ to: 'api', props }], seed)
      go(run)
      await run.runToEnd()
      const spans = attempts(run)
      return spans.slice(1).map(([, startUs], i) => startUs - spans[i][2])
    }
    const first = await gaps(1)
    assert.equal(first.length, 3, 'three retries')
    // Backoff doubles from 100 ms, and jitter moves each delay by up to half of it either way.
    for (const [i, gap] of first.entries()) {
      const nominal = 100 * MS * 2 ** i
      assert.ok(gap >= nominal / 2 && gap <= nominal * 1.5, `retry ${i + 1} after ${gap} µs`)
    }
    assert.notDeepEqual(first, [100 * MS, 200 * MS, 400 * MS], 'jitter moved the retries')
    assert.deepEqual(await gaps(1), first)
  })

  it('loses messages at the edge’s packet loss rate, and a lost request times out and is retried', async () => {
    const props = { packetLoss: 1, timeout: 50, retries: 1, retryBackoff: 100, retryJitter: 0 }
    const lost = network([server('api')], [{ to: 'api', props }])
    const reply = go(lost)
    await lost.runToEnd()
    assert.deepEqual([reply.atUs, reply.body.code], [200 * MS, 'E_SIM_TIMEOUT'])
    assert.equal(attempts(lost).length, 2)
    assert.equal(lost.spans.filter(s => s.node === 'api').length, 0, 'no attempt arrived')

    const lossy = network([server('api')], [{ to: 'api', props: { packetLoss: 0.25 } }])
    for (let i = 0; i < 4000; i++)
      lossy.inject({ node: 'client', port: 'in', method: 'fire', atUs: i })
    await lossy.runToEnd()
    // One standard deviation is √(4,000 × 0.25 × 0.75) ≈ 27 messages.
    const arrived = lossy.spans.filter(s => s.node === 'api').length
    assert.ok(Math.abs(arrived - 3000) < 150, `${arrived} of 4,000 arrived`)
  })

  it('routes by method, path prefix, header and expression, and a specific edge beats a catch-all', async () => {
    const names = ['orders', 'users', 'canary', 'big', 'admin', 'reports', 'fallback']
    const run = network(
      names.map(n => server(n)),
      [
        { to: 'orders', props: { route: ['path /orders'] } },
        { to: 'users', props: { route: ['path /users'] } },
        { to: 'canary', props: { route: ['header X-Canary = 1'] } },
        { to: 'big', props: { route: ['when msg.body.total > 1000'] } },
        { to: 'admin', method: 'purge' },
        { to: 'reports', props: { route: ['method report, audit'] } },
        { to: 'fallback' },
      ]
    )
    const sends = {
      orders: { options: { path: '/orders/42' } },
      prefixBySegment: { options: { path: '/ordersX' } },
      users: { options: { path: '/users' } },
      canary: { options: { headers: { 'x-canary': '1' } } },
      big: { body: { total: 1500 } },
      small: { body: { total: 15 } },
      admin: { method: 'purge' },
      reports: { method: 'audit' },
      plain: {},
    }
    const replies = Object.entries(sends).map(([name, args], i) => [name, go(run, args, i * MS)])
    run.inject({
      node: 'client',
      port: 'in',
      method: 'fire',
      body: { options: { path: '/users/7' } },
      atUs: 100 * MS,
    })
    await run.runToEnd()
    assert.deepEqual(Object.fromEntries(replies.map(([name, r]) => [name, r.body.at])), {
      orders: 'orders',
      prefixBySegment: 'fallback',
      users: 'users',
      canary: 'canary',
      big: 'big',
      small: 'fallback',
      admin: 'admin',
      reports: 'reports',
      plain: 'fallback',
    })
    const orders = replies[0][1].body
    assert.deepEqual([orders.path, orders.headers], ['/orders/42', {}])
    const event = run.spans.find(s => s.startUs >= 100 * MS && s.node !== 'client')
    assert.equal(event?.node, 'users', 'events are routed too')
  })

  it('sends a message that names no method over an edge that names one, which then calls it', async () => {
    const run = network(
      [server('orders'), server('audit')],
      [
        { to: 'orders', method: 'report', props: { route: ['path /orders'] } },
        { to: 'audit', method: 'audit', props: { route: ['path /audit'] } },
      ]
    )
    const replies = [
      go(run, { method: null, options: { path: '/orders/1' } }, 0),
      go(run, { method: null, options: { path: '/audit' } }, MS),
      go(run, { method: 'report', options: { path: '/orders/3' } }, 2 * MS),
      go(run, { method: 'purge', options: { path: '/orders/2' } }, 3 * MS),
    ]
    await run.runToEnd()
    assert.deepEqual(
      replies.map(r => r.body.at ?? r.body.code),
      ['orders', 'audit', 'orders', 'E_SIM_NO_ROUTE'],
      'a message that names a method takes only edges naming it or none'
    )
    const called = run.spans
      .filter(s => s.kind === 'public' && s.node !== 'client')
      .map(s => [s.node, s.method])
    assert.deepEqual(called, [
      ['orders', 'report'],
      ['audit', 'audit'],
      ['orders', 'report'],
    ])
  })

  it('fails a send no edge carries with E_SIM_NO_ROUTE, and a malformed rule with E_SIM_ROUTE_INVALID', async () => {
    const run = network([server('orders')], [{ to: 'orders', props: { route: ['path /orders'] } }])
    const reply = go(run, { options: { path: '/users' } })
    await run.runToEnd()
    assert.equal(reply.body.code, 'E_SIM_NO_ROUTE')
    assert.match(reply.body.message, /'out' of client/)
    for (const rule of [
      'colour red',
      'weight -3',
      'weight',
      'path',
      'header x-canary',
      'method',
      'when msg.body.total >',
    ])
      assert.throws(
        () => network([server('orders')], [{ to: 'orders', props: { route: [rule] } }]),
        /** @param {any} err */ err => err.code === 'E_SIM_ROUTE_INVALID' && /e1/.test(err.message),
        rule
      )
  })

  it('gives a method the message’s protocol details and attempt, and none of the run’s own fields', async () => {
    /** @type {any[]} */
    const seen = []
    const run = network([server('api', { seen })], [{ to: 'api', props: { payloadSize: 400 } }])
    go(run, { options: { path: '/a', headers: { h: 'v' } } })
    run.inject({ node: 'api', port: 'in', method: 'get', path: '/b', sizeBytes: 9, atUs: MS })
    await run.runToEnd()
    const keys = [
      'attempt',
      'body',
      'headers',
      'kind',
      'method',
      'parentSpanId',
      'path',
      'sizeBytes',
      'spanId',
      'traceId',
    ]
    assert.deepEqual(
      seen.map(m => Object.keys(m).sort()),
      [keys, keys]
    )
    const fields = (/** @type {any} */ m) => [
      m.kind,
      m.method,
      m.path,
      m.headers,
      m.sizeBytes,
      m.attempt,
    ]
    assert.deepEqual(fields(seen[0]), ['request', 'get', '/a', { h: 'v' }, 400, 1])
    assert.deepEqual(fields(seen[1]), ['request', 'get', '/b', {}, 9, 1])
  })
})
