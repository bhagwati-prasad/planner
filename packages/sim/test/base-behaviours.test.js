// @ts-check
// Base behaviours (task 0407, spec §8 "Behaviour API", §9 "State and methods"): a component that
// extends a base type simulates without code. Its base behaviour answers the public methods it
// declares, with state and a cost model from its properties, and its own code overrides any
// base method of the same name.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as sim from '../src/index.js'

const MS = 1000
const S = 1_000_000
const constant = (/** @type {number} */ ms) => ({ kind: 'constant', value: ms })

/**
 * A component type that extends `base`, whose port `in` exposes `methods`.
 * @param {string} base @param {string[]} methods @param {{ out?: boolean }} [options]
 */
function extending(base, methods, { out = false } = {}) {
  return {
    strataApi: '^1.0',
    id: `t.${base.slice(5)}`,
    name: base,
    version: '1.0.0',
    extends: base,
    ports: [
      { name: 'in', direction: 'in', exposes: methods },
      ...(out ? [{ name: 'out', direction: 'out' }] : []),
    ],
    methods: { public: Object.fromEntries(methods.map(m => [m, {}])) },
  }
}

/**
 * Sends each request to the component `it`, one simulated second apart, and returns each
 * reply's status, body or error code, and how long it took.
 * @param {object} manifest
 * @param {[string, unknown?][]} requests  method and body
 * @param {{ props?: object, behaviour?: object, nodes?: object[], edges?: object[], seed?: number }} [options]
 */
async function answers(
  manifest,
  requests,
  { props, behaviour, nodes = [], edges = [], seed = 1 } = {}
) {
  const run = sim.createRun({
    seed,
    nodes: /** @type {any} */ ([{ id: 'it', manifest, props, behaviour }, ...nodes]),
    edges: /** @type {any} */ (edges),
  })
  const replies = requests.map(([method, body], i) =>
    run.inject({ node: 'it', port: 'in', method, body, atUs: i * S })
  )
  await run.runToEnd()
  return {
    run,
    replies: replies.map((r, i) => [
      r.status,
      r.status === 'ok' ? r.body : r.error?.code,
      Number(r.atUs) - i * S,
    ]),
  }
}

describe('base behaviours answer their public methods using the cost model from their properties', () => {
  it('base:service answers each endpoint after its service time', async () => {
    const service = extending('base:service', ['placeOrder', 'health'])
    const { replies } = await answers(service, [['placeOrder', { sku: 'a' }], ['health']], {
      props: { serviceTime: constant(20) },
    })
    assert.deepEqual(replies, [
      ['ok', null, 20 * MS],
      ['ok', { status: 'up' }, 20 * MS],
    ])
  })

  it('base:queue keeps its messages, up to its capacity, until they are acknowledged', async () => {
    const queue = extending('base:queue', ['publish', 'receive', 'ack', 'nack'])
    const { replies } = await answers(
      queue,
      [
        ['publish', 'a'],
        ['publish', 'b'],
        ['publish', 'c'],
        ['receive'],
        ['nack', { id: 1 }],
        ['receive'],
        ['ack', { id: 1 }],
        ['ack', { id: 1 }],
        ['receive'],
        ['receive'],
      ],
      { props: { capacityMessages: 2 } }
    )
    assert.deepEqual(
      replies.map(([status, body]) => [status, body]),
      [
        ['ok', { id: 1 }],
        ['ok', { id: 2 }],
        ['error', 'QUEUE_FULL'],
        ['ok', { id: 1, body: 'a' }],
        ['ok', null],
        ['ok', { id: 1, body: 'a' }],
        ['ok', null],
        ['error', 'UNKNOWN_MESSAGE'],
        ['ok', { id: 2, body: 'b' }],
        ['ok', null],
      ]
    )
  })

  it('base:topic keeps a log that each consumer group reads from its own offset', async () => {
    const topic = extending('base:topic', ['publish', 'subscribe', 'poll', 'commit'])
    const { replies } = await answers(topic, [
      ['publish', 'x'],
      ['publish', 'y'],
      ['poll', { group: 'g' }],
      ['commit', { group: 'g', offset: 2 }],
      ['poll', { group: 'g' }],
      ['subscribe', { group: 'h' }],
      ['poll', { group: 'h' }],
    ])
    assert.deepEqual(
      replies.map(([status, body]) => [status, body]),
      [
        ['ok', { offset: 0 }],
        ['ok', { offset: 1 }],
        [
          'ok',
          [
            { offset: 0, body: 'x' },
            { offset: 1, body: 'y' },
          ],
        ],
        ['ok', null],
        ['ok', []],
        ['ok', { offset: 0 }],
        [
          'ok',
          [
            { offset: 0, body: 'x' },
            { offset: 1, body: 'y' },
          ],
        ],
      ]
    )
  })

  it('base:store keeps items by key, reading and writing in their own latencies', async () => {
    const store = extending('base:store', ['get', 'put', 'delete', 'query'])
    const { replies } = await answers(
      store,
      [
        ['put', { key: 'a', value: 1 }],
        ['get', { key: 'a' }],
        ['get', { key: 'b' }],
        ['query'],
        ['delete', { key: 'a' }],
        ['get', { key: 'a' }],
      ],
      { props: { readLatency: constant(2), writeLatency: constant(5) } }
    )
    assert.deepEqual(replies, [
      ['ok', null, 5 * MS],
      ['ok', 1, 2 * MS],
      ['ok', null, 2 * MS],
      ['ok', [1], 2 * MS],
      ['ok', null, 5 * MS],
      ['ok', null, 2 * MS],
    ])
  })

  it('base:cache answers hits and misses in its hit latency', async () => {
    const cache = extending('base:cache', ['get', 'set', 'delete'])
    const { replies } = await answers(
      cache,
      [
        ['get', { key: 'k' }],
        ['set', { key: 'k', value: 'v' }],
        ['get', { key: 'k' }],
        ['delete', { key: 'k' }],
        ['get', { key: 'k' }],
      ],
      { props: { hitLatency: constant(1) } }
    )
    assert.deepEqual(replies, [
      ['ok', null, 1 * MS],
      ['ok', null, 1 * MS],
      ['ok', 'v', 1 * MS],
      ['ok', null, 1 * MS],
      ['ok', null, 1 * MS],
    ])
  })

  it('base:proxy forwards a message with its path and headers, adding its processing latency', async () => {
    const proxy = extending('base:proxy', ['forward'], { out: true })
    const backend = {
      id: 'backend',
      manifest: extending('base:service', ['lookup']),
      props: { serviceTime: constant(10) },
      behaviour: {
        public: {
          lookup: (/** @type {any} */ msg) => ({ path: msg.path, headers: msg.headers }),
        },
      },
    }
    const run = sim.createRun({
      seed: 1,
      nodes: /** @type {any} */ ([
        { id: 'it', manifest: proxy, props: { processingLatency: constant(3) } },
        backend,
      ]),
      edges: [
        {
          id: 'e1',
          from: { node: 'it', port: 'out' },
          to: { node: 'backend', port: 'in' },
          method: 'lookup',
        },
      ],
    })
    const reply = run.inject({
      node: 'it',
      port: 'in',
      method: 'forward',
      path: '/orders/1',
      headers: { 'x-trace': 't' },
    })
    await run.runToEnd()
    assert.deepEqual(
      [reply.status, reply.body, reply.atUs],
      ['ok', { path: '/orders/1', headers: { 'x-trace': 't' } }, 13 * MS]
    )
  })

  it('base:timer emits on its out port when triggered, unless paused', async () => {
    const timer = extending('base:timer', ['trigger', 'pause', 'resume'], { out: true })
    const job = {
      id: 'job',
      manifest: extending('base:service', ['run']),
      behaviour: { public: { run: () => null } },
    }
    const { run, replies } = await answers(
      timer,
      [['trigger'], ['pause'], ['trigger'], ['resume'], ['trigger']],
      {
        nodes: [job],
        edges: [
          {
            id: 'e1',
            from: { node: 'it', port: 'out' },
            to: { node: 'job', port: 'in' },
            method: 'run',
          },
        ],
      }
    )
    assert.deepEqual(
      replies.map(([status, body]) => [status, body]),
      [
        ['ok', { runs: 1 }],
        ['ok', null],
        ['error', 'PAUSED'],
        ['ok', null],
        ['ok', { runs: 2 }],
      ]
    )
    assert.equal(run.spans.filter(s => s.node === 'job').length, 2, 'the job ran twice')
  })

  it('base:external answers calls after its latency, failing at its error rate', async () => {
    const external = extending('base:external', ['call'])
    const calls = /** @type {[string][]} */ (Array.from({ length: 4 }, () => ['call']))
    const up = await answers(external, calls, { props: { latency: constant(7), errorRate: 0 } })
    assert.deepEqual(up.replies[0], ['ok', null, 7 * MS])
    const down = await answers(external, calls, { props: { latency: constant(7), errorRate: 1 } })
    assert.deepEqual(down.replies[0], ['error', 'UNAVAILABLE', 7 * MS])
    const half = await answers(
      external,
      /** @type {[string][]} */ (Array.from({ length: 1000 }, () => ['call'])),
      {
        props: { errorRate: 0.5 },
      }
    )
    const failed = half.replies.filter(([status]) => status === 'error').length
    assert.ok(Math.abs(failed - 500) < 80, `${failed} of 1,000 failed`)
  })

  it('base:client has no public methods: scenarios start its requests', async () => {
    const client = { ...extending('base:client', []), ports: [{ name: 'in', direction: 'in' }] }
    const { replies } = await answers(client, [['go']])
    assert.equal(replies[0][1], 'E_METHOD_NOT_EXPOSED')
  })
})

describe('base behaviours', () => {
  it('simulate a manifest with extends and no entry without any code', async () => {
    const starter = (/** @type {string} */ name) =>
      JSON.parse(
        readFileSync(new URL(`../../../components/${name}/manifest.json`, import.meta.url), 'utf8')
      )
    const cache = starter('cache')
    assert.equal(cache.entry ?? null, null, 'the starter cache has no entry')
    const { replies } = await answers(cache, [
      ['set', { key: 'k', value: 42 }],
      ['get', { key: 'k' }],
    ])
    assert.deepEqual(
      replies.map(([status, body]) => [status, body]),
      [
        ['ok', null],
        ['ok', 42],
      ]
    )
    const queue = starter('message-queue')
    const published = await answers(queue, [['publish', 'm'], ['receive']])
    assert.deepEqual(published.replies[1].slice(0, 2), ['ok', { id: 1, body: 'm' }])
  })

  it('let an entry method override the base method of the same name', async () => {
    const cache = extending('base:cache', ['get', 'set'])
    const { run, replies } = await answers(
      cache,
      [
        ['set', { key: 'k', value: 'v' }],
        ['get', { key: 'k' }],
      ],
      {
        props: { hitLatency: constant(1) },
        behaviour: { public: { get: (/** @type {any} */ msg) => `mine: ${msg.body.key}` } },
      }
    )
    assert.deepEqual(replies, [
      ['ok', null, 1 * MS],
      ['ok', 'mine: k', 1 * MS],
    ])
    assert.deepEqual(
      run.changes.map(c => c.path),
      [['entries', 'k']],
      'the base set still wrote the entry'
    )
  })
})
