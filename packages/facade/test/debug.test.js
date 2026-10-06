// @ts-check
// strata.debug (spec §13, §18, task 0429): the debugger's commands over the worker protocol, on
// the run being debugged, the latest started unless one is attached. Breakpoints on calls,
// arrivals, departures, edges and named logs; hops with their differences; the followed
// request's method stack; state; and effective properties, with what a composite's inner system
// rolls up to beside each value.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeScheduler } from '../../../tools/testing/index.js'
import { createSimHost } from '../src/index.js'
import { CORE } from '../src/internal.js'
import * as sim from '../../sim/src/index.js'
import { debugExtensions } from '../../debug/src/index.js'
import { spawnThreadWorker } from '../../server/src/index.js'
import { simWorkerSource } from '../../../scripts/build.js'
import {
  FIXTURE_MANIFESTS,
  buildRecursivePayments,
} from '../../../tools/fixtures/recursive-payments.js'
import { createTestStrata } from './fixtures.js'
import { ENDPOINTS, checkout, orders } from './runs.js'

/** The last part of a run path: a node's id. @param {string} path */
const id = path => path.split('/').at(-1)

describe('strata.debug', () => {
  it('pauses before a private call, then shows the hops, method stack and state, in a worker_threads worker', async () => {
    const host = createSimHost({
      spawn: spawnThreadWorker(await simWorkerSource()),
      scheduler: createFakeScheduler(),
    })
    const strata = await checkout(host)
    try {
      const root = (await strata.projects.open('checkout')).root
      // A gateway in front: it waits for the service, which waits for the database.
      const gw = root.add('api-gateway', { name: 'Edge GW', props: { authMode: 'none' } })
      const svc = root.add('service', { name: 'Orders', props: { endpoints: ENDPOINTS } })
      const db = root.add('relational-db', { name: 'Orders DB' })
      root.connect(gw.port('out'), svc.port('in'), { type: 'http' })
      root.connect(svc.port('out'), db.port('in'), { type: 'db-protocol', method: 'insert' })
      const run = await strata.sim.start({ requests: orders(gw, 2), seed: 5, inspect: true })
      assert.equal(strata.debug.run, run, 'the latest run is the one debugged')

      await strata.debug.setBreakpoint({ on: 'call', node: db, method: 'lock', kind: 'private' })
      await run.runToEnd()
      assert.equal(run.status, 'paused', 'the breakpoint paused it')
      /** Whether a span of a method is in the trace. @param {string} method */
      const ran = async method =>
        (await run.spans()).some((/** @type {any} */ s) => s.method === method)
      assert.equal(await ran('lock'), false, 'lock has not run')

      // The insert locks its row in the event it arrives in, and answers after its write.
      await run.stepForward(1, 'event')
      assert.equal(await ran('lock'), true, 'the next event runs it')
      const insert = (await run.spans()).find(
        (/** @type {any} */ s) => s.kind === 'public' && s.method === 'insert'
      )
      await run.follow(insert.traceId)
      const stack = await strata.debug.methodStack()
      assert.deepEqual(
        stack.map((/** @type {any} */ s) => [id(s.node), s.method, s.kind]),
        [
          [gw.id, 'forward', 'public'],
          [svc.id, 'request', 'public'],
        ],
        'the gateway waits for the service, which waits for the insert'
      )
      const hops = await strata.debug.hops()
      assert.deepEqual(
        hops.map((/** @type {any} */ h) => [id(h.node), h.kind, h.method]),
        [
          [gw.id, 'request', 'forward'],
          [svc.id, 'request', 'request'],
          [db.id, 'request', 'insert'],
        ]
      )
      assert.deepEqual(hops[0].diff, [], 'the first hop has nothing before it')
      assert.deepEqual(hops[2].body, hops[0].body, 'the service inserts the order it was sent')
      assert.equal(hops[2].body.table, 'orders')
      const changed = hops[2].diff.map((/** @type {any} */ d) => d.field)
      for (const field of ['node', 'method', 'path', 'headers.method'])
        assert.ok(changed.includes(field), `the insert's hop differs in ${field}`)
      assert.equal(hops[2].sinceUs, hops[2].atUs - hops[1].atUs)
      assert.deepEqual(strata.debug.state(db), run.state(db))

      await strata.debug.clearBreakpoints()
      await run.runToEnd()
      assert.equal(run.status, 'finished')
    } finally {
      host.terminate()
    }
  })

  it('gives effective properties with their sources, and a composite’s roll-up beside each', async () => {
    const { strata } = createTestStrata({
      simHost: sim.createInProcessSimHost({ extensions: debugExtensions }),
    })
    for (const m of FIXTURE_MANIFESTS) strata.components.register(m)
    const p = await strata.projects.create('Checkout')
    const ids = buildRecursivePayments({
      rootSystemId: p.root.id,
      dispatch: command => p.dispatch(command),
      portsOf: nodeId => p[CORE].portsOf(nodeId),
    })
    const run = await strata.sim.start({
      requests: [{ to: ids.payments, method: 'refund', body: { id: 1 } }],
      seed: 2,
    })
    await run.stepForward(1, 'event')
    run.edit(ids.gateway, { props: { serviceTime: 3 } })
    await run.resume()
    await run.pause()

    const fraud = await strata.debug.effectiveProps(ids.fraud)
    const inside = p.node(ids.fraud).child
    assert.deepEqual(fraud.serviceTime, {
      value: { kind: 'constant', value: 15 },
      source: 'override',
      rollup: {
        median: inside.rollup('serviceTime.median'),
        p99: inside.rollup('serviceTime.p99'),
      },
    })
    assert.notEqual(fraud.serviceTime.rollup.median, 15, 'the black box and its inside differ')
    const gateway = await strata.debug.effectiveProps(ids.gateway)
    assert.deepEqual(gateway.serviceTime, { value: 3, source: 'run-only' })
  })

  it("lists every debugger command in strata.help('debug') with its signature", () => {
    const { strata } = createTestStrata()
    const text = strata.helpText('debug')
    for (const signature of [
      'strata.debug.run',
      'strata.debug.attach(run)',
      'strata.debug.setBreakpoint(spec)',
      'strata.debug.clearBreakpoints()',
      'strata.debug.hops(trace)',
      'strata.debug.methodStack()',
      'strata.debug.state(node)',
      'strata.debug.effectiveProps(node)',
    ])
      assert.ok(text.includes(`  ${signature}\n`), `strata.help('debug') lists ${signature}`)
  })
})
