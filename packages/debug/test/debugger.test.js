// @ts-check
// Breakpoints and inspection (task 0416, spec §13): a breakpoint on a private method pauses
// before the method runs; hop inspection diffs each hop of a request against the one before;
// the method stack lists the followed request's active calls; and effective properties say where
// each value comes from, run-only changes included.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeScheduler } from '../../../tools/testing/index.js'
import * as sim from '../../sim/src/index.js'
import { createDebugger } from '../src/index.js'

/** A component type for these tests. @param {string} id @param {object} rest */
const type = (id, rest) => ({ strataApi: '^1.0', id, name: id, version: '1.0.0', ...rest })

/**
 * An API that sends each order on to a Payments composite, whose service waits, checks the
 * amount in a private method and answers. The API passes the order id on as a header.
 */
const payments = () => ({
  seed: 1,
  inspect: true,
  nodes: [
    {
      id: 'api',
      manifest: type('t.api', {
        ports: [
          { name: 'in', direction: 'in', exposes: ['order'] },
          { name: 'out', direction: 'out' },
        ],
        properties: {
          retries: { type: 'integer', default: 2 },
          timeoutMs: { type: 'number', default: 500 },
          region: { type: 'string', default: 'eu' },
        },
        methods: { public: { order: {} } },
      }),
      props: { retries: 5 },
      behaviour: {
        public: {
          async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
            const paid = await ctx.send('out', 'pay', msg.body, {
              path: '/pay',
              headers: { 'x-order': String(msg.body.id) },
            })
            return paid
          },
        },
      },
    },
    {
      id: 'pay',
      manifest: type('t.payments', {
        ports: [{ name: 'in', direction: 'in', exposes: ['pay'] }],
        methods: { public: { pay: {} } },
      }),
      composite: {
        mode: 'expanded',
        bindings: { in: { pay: { node: 'pay/svc', port: 'in', method: 'pay' } } },
        exits: {},
      },
    },
    {
      id: 'pay/svc',
      manifest: type('t.service', {
        ports: [{ name: 'in', direction: 'in', exposes: ['pay'] }],
        methods: { public: { pay: {} }, private: { check: {} } },
      }),
      behaviour: {
        public: {
          async pay(/** @type {any} */ msg, /** @type {any} */ ctx) {
            await ctx.spend(2)
            return { ok: ctx.call('check', msg.body) }
          },
        },
        private: { check: (/** @type {any} */ body) => body.amount < 100 },
      },
    },
  ],
  edges: [
    {
      id: 'payments',
      from: { node: 'api', port: 'out' },
      to: { node: 'pay', port: 'in' },
      props: { latency: 1 },
    },
  ],
})

/** A control and its debugger over the payments model, with one order injected, paused. */
async function debugging() {
  const control = sim.createControl(payments(), { scheduler: createFakeScheduler() })
  control.inject({ node: 'api', port: 'in', method: 'order', body: { id: 7, amount: 5 } })
  const debug = createDebugger(control)
  await control.play()
  await control.pause()
  return { control, debug }
}

/** The spans of a run, as [node, method, kind, status]. @param {any} run */
const calls = run =>
  run.spans
    .filter((/** @type {any} */ s) => s.kind === 'public' || s.kind === 'private')
    .map((/** @type {any} */ s) => [s.node, s.method, s.kind, s.status])

describe('debugger', () => {
  it('pauses before a private method runs when a breakpoint is set on it', async () => {
    const { control, debug } = await debugging()
    debug.setBreakpoint({ on: 'call', node: 'pay/svc', method: 'check' })
    await control.runToEnd()
    assert.equal(control.state, 'paused')
    assert.ok(!calls(control.run).some(([, method]) => method === 'check'), 'check has not run yet')
    assert.deepEqual(calls(control.run), [
      ['api', 'order', 'public', 'running'],
      ['pay/svc', 'pay', 'public', 'running'],
    ])
    await control.step(1, 'event')
    assert.deepEqual(
      calls(control.run).find(([, method]) => method === 'check'),
      ['pay/svc', 'check', 'private', 'ok'],
      'the next event runs it'
    )
    debug.clearBreakpoints()
    await control.runToEnd()
    assert.equal(control.state, 'finished')
  })

  it('lists the followed request’s active calls, outermost first', async () => {
    const { control, debug } = await debugging()
    debug.setBreakpoint({ on: 'call', node: 'pay/svc', method: 'check' })
    await control.runToEnd()
    const order = control.run.spans.find((/** @type {any} */ s) => s.node === 'api')
    control.follow(order.traceId)
    assert.deepEqual(
      debug.methodStack().map((/** @type {any} */ s) => [s.node, s.method, s.kind]),
      [
        ['api', 'order', 'public'],
        ['pay/svc', 'pay', 'public'],
      ]
    )
    debug.clearBreakpoints()
    await control.runToEnd()
    assert.deepEqual(debug.methodStack(), [], 'nothing is active once the request is answered')
  })

  it('shows each hop of a request, with the diff against the hop before', async () => {
    const { control, debug } = await debugging()
    await control.runToEnd()
    const order = control.run.spans.find((/** @type {any} */ s) => s.node === 'api')
    control.follow(order.traceId)
    const hops = debug.hops()
    assert.deepEqual(
      hops.map((/** @type {any} */ h) => [h.node, h.kind, h.method]),
      [
        ['api', 'request', 'order'],
        ['pay/svc', 'request', 'pay'],
        ['api', 'response', 'pay'],
      ]
    )
    assert.deepEqual(hops[0].diff, [], 'the first hop has nothing before it')
    assert.deepEqual(hops[1].body, { id: 7, amount: 5 })
    assert.deepEqual(hops[1].headers, { 'x-order': '7' })
    assert.deepEqual(hops[1].diff, [
      { field: 'node', a: 'api', b: 'pay/svc' },
      { field: 'method', a: 'order', b: 'pay' },
      { field: 'path', a: null, b: '/pay' },
      { field: 'headers.x-order', a: undefined, b: '7' },
    ])
    assert.equal(hops[1].sinceUs, hops[1].atUs - hops[0].atUs)
    assert.deepEqual(hops[2].body, { ok: true })
    assert.ok(hops[2].diff.some((/** @type {any} */ d) => d.field === 'body.ok'))
    await control.restart()
    assert.deepEqual(debug.hops(), [], 'a fresh run has no hops yet')
  })

  it('reports each effective property with its source, run-only changes included', async () => {
    const { control, debug } = await debugging()
    control.edit({ kind: 'props', node: 'api', props: { timeoutMs: 900 } })
    await control.resume()
    await control.pause()
    assert.deepEqual(debug.effectiveProps('api'), {
      retries: { value: 5, source: 'override' },
      timeoutMs: { value: 900, source: 'run-only' },
      region: { value: 'eu', source: 'default' },
    })
    assert.deepEqual(debug.state('pay/svc'), {})
  })
})
