// @ts-check
// Servers (ADR 0020, spec §11 "Routing and resources"): a node that extends base:service, or
// whose manifest declares servers, admits each public call to a free server, queues it first in,
// first out when all are busy, refuses it with BACKLOG_FULL when the backlog is full, and gives
// up on it with TIMEOUT when it waits too long. ctx.spend (ADR 0021) waits in simulated time,
// holding the call's server.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as sim from '../src/index.js'

const MS = 1000

/**
 * A node `api` whose port `in` exposes `work`, and a run of it.
 * @param {{ props?: object, manifest?: object, behaviour?: object }} [parts]
 */
function service({ props = {}, manifest = {}, behaviour } = {}) {
  return sim.createRun({
    seed: 1,
    nodes: /** @type {any} */ ([
      {
        id: 'api',
        manifest: {
          strataApi: '^1.0',
          id: 't.api',
          name: 'API',
          version: '1.0.0',
          extends: 'base:service',
          ports: [{ name: 'in', direction: 'in', exposes: ['work'] }],
          methods: { public: { work: {} } },
          ...manifest,
        },
        props,
        behaviour,
      },
    ]),
  })
}

/** Sends `n` calls to `work` at `atUs`. @param {any} run @param {number} n */
const calls = (run, n, atUs = 0) =>
  Array.from({ length: n }, () => run.inject({ node: 'api', port: 'in', method: 'work', atUs }))

describe('servers', () => {
  it('queues the ninth concurrent call on 2 instances × 4 concurrency, and answers it when a server frees', async () => {
    const run = service({ props: { instances: 2, concurrency: 4, serviceTime: 100 } })
    const replies = calls(run, 9)
    await run.runToEnd()
    assert.deepEqual(
      replies.map(r => r.atUs),
      [...Array(8).fill(100 * MS), 200 * MS]
    )
    const spans = run.spans.filter(s => s.method === 'work')
    assert.deepEqual(
      spans.map(s => [s.startUs, s.queuedUs ?? 0]),
      [...Array(8).fill([0, 0]), [0, 100 * MS]],
      'the ninth span starts when it arrived and shows how long it queued'
    )
    const backlog = run.metrics.filter(m => m.name === 'backlog').map(m => [m.atUs, m.value])
    assert.deepEqual(backlog, [
      [0, 1],
      [100 * MS, 0],
    ])
    const busiest = Math.max(...run.metrics.filter(m => m.name === 'utilisation').map(m => m.value))
    assert.equal(busiest, 1)
  })

  it('refuses a call with BACKLOG_FULL when the backlog is full, and gives up on one that waits past its timeout', async () => {
    const full = service({
      props: { instances: 1, concurrency: 1, maxBacklog: 1, serviceTime: 100 },
    })
    const [first, second, third] = calls(full, 3)
    await full.runToEnd()
    assert.deepEqual([first.status, second.status, third.error?.code], ['ok', 'ok', 'BACKLOG_FULL'])

    const slow = service({
      props: { instances: 1, concurrency: 1, maxBacklog: 5, timeout: 50, serviceTime: 100 },
    })
    const [running, waiting] = calls(slow, 2)
    await slow.runToEnd()
    assert.deepEqual([running.status, running.atUs], ['ok', 100 * MS])
    assert.deepEqual([waiting.error?.code, waiting.atUs], ['TIMEOUT', 50 * MS])
  })

  it('takes its servers from a manifest’s servers field, which may count a state field', async () => {
    const run = service({
      props: { slots: 2 },
      manifest: {
        servers: { count: ['state.live', 'slots'], backlog: 0 },
        state: { live: { type: 'integer', initial: 1 } },
        ports: [{ name: 'in', direction: 'in', exposes: ['work', 'grow'] }],
        methods: { public: { work: { latency: { kind: 'constant', value: 100 } }, grow: {} } },
      },
      behaviour: {
        public: {
          work: () => 'done',
          grow(/** @type {any} */ _msg, /** @type {any} */ ctx) {
            ctx.state.live = 2
          },
        },
      },
    })
    const before = calls(run, 3)
    run.inject({ node: 'api', port: 'in', method: 'grow', atUs: 200 * MS })
    const after = calls(run, 4, 300 * MS)
    await run.runToEnd()
    assert.deepEqual(
      before.map(r => r.error?.code ?? r.status),
      ['ok', 'ok', 'BACKLOG_FULL'],
      'one live instance of two slots, and no backlog'
    )
    assert.deepEqual(
      after.map(r => r.status),
      ['ok', 'ok', 'ok', 'ok'],
      'two live instances'
    )
  })

  it('admits waiting calls when a timer that grows a count counted from state ends', async () => {
    const run = service({
      props: { slots: 1 },
      manifest: {
        servers: { count: ['state.live', 'slots'] },
        state: { live: { type: 'integer', initial: 1 } },
        methods: { public: { work: { latency: { kind: 'constant', value: 100 } } } },
      },
      behaviour: {
        init: (/** @type {any} */ ctx) => ctx.schedule(40, 'grow'),
        public: { work: () => 'done' },
        onTimer(/** @type {unknown} */ _timer, /** @type {any} */ ctx) {
          ctx.state.live = 2
        },
      },
    })
    const replies = calls(run, 3)
    await run.runToEnd()
    assert.deepEqual(
      replies.map(r => r.atUs),
      [100 * MS, 140 * MS, 200 * MS],
      'the second starts at 40 ms, on the server the timer added'
    )
  })

  it('reports busy and waiting servers under the names its manifest gives them', async () => {
    const run = service({
      props: { slots: 1 },
      manifest: {
        servers: {
          count: ['slots'],
          metrics: { busy: 'activeConnections', waiting: 'waitingConnections' },
        },
        methods: { public: { work: { latency: { kind: 'constant', value: 100 } } } },
      },
    })
    calls(run, 2)
    await run.runToEnd()
    /** @param {string} name */
    const named = name => run.metrics.filter(m => m.name === name).map(m => [m.atUs / MS, m.value])
    assert.deepEqual(named('waitingConnections'), [
      [0, 1],
      [100, 0],
    ])
    assert.deepEqual(named('activeConnections'), [
      [0, 1],
      [100, 0],
      [100, 1],
      [200, 0],
    ])
    assert.deepEqual(named('backlog'), [], 'in place of backlog')
  })

  it('lets a method spend simulated time with ctx.spend, holding its server', async () => {
    const run = service({
      props: { instances: 1, concurrency: 1, serviceTime: 0 },
      behaviour: {
        public: {
          async work(/** @type {any} */ _msg, /** @type {any} */ ctx) {
            await ctx.spend(30)
            await ctx.spend({ kind: 'constant', value: 20 })
            return ctx.now
          },
        },
      },
    })
    const [first, second] = calls(run, 2)
    await run.runToEnd()
    assert.deepEqual([first.atUs, first.body], [50 * MS, 50])
    assert.deepEqual([second.atUs, second.body], [100 * MS, 100], 'it waited for the server')
  })
})
