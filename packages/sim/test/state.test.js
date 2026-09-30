// @ts-check
// Typed state at run time (task 0404, spec §6 "State"): a node's state starts from its
// manifest's initial values, its fixtures and its instance overrides; queues, lists, maps and
// tables keep their shapes; and every change is recorded for the debugger.
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDevelopment } from '../../core/src/index.js'
import * as sim from '../src/index.js'

const development = isDevelopment()
afterEach(() => assert.equal(isDevelopment(), development))

/**
 * One node of a run, with a manifest whose port `in` exposes every public method it lists.
 * @param {{ state: object, methods: Record<string, Function>, privates?: Record<string, Function>, instance?: object, fixtures?: object, extra?: object[], edges?: object[] }} parts
 */
function nodeRun({ state, methods, privates = {}, instance, fixtures, extra = [], edges = [] }) {
  const names = Object.keys(methods)
  return sim.createRun({
    seed: 1,
    nodes: [
      {
        id: 'store',
        manifest: {
          strataApi: '^1.0',
          id: 't.store',
          name: 'Store',
          version: '1.0.0',
          // The abstract root type, so no base behaviour adds state fields (task 0407).
          extends: 'base:component',
          ports: [{ name: 'in', direction: 'in', exposes: names }],
          methods: {
            public: Object.fromEntries(names.map(n => [n, {}])),
            private: Object.fromEntries(Object.keys(privates).map(n => [n, {}])),
          },
          state,
        },
        behaviour: { public: methods, private: privates },
        ...(instance ? { state: instance } : {}),
        ...(fixtures ? { fixtures } : {}),
      },
      ...extra,
    ],
    edges: /** @type {any} */ (edges),
  })
}

const ask = (/** @type {any} */ run, /** @type {string} */ method, body = {}, atUs = 0) =>
  run.inject({ node: 'store', port: 'in', method, body, atUs })

describe('state at run time', () => {
  it('starts from the manifest’s initial values, with the instance’s overrides over them', async () => {
    const state = {
      handled: { type: 'integer', initial: 0 },
      region: { type: 'string', initial: 'eu' },
      tags: { type: 'list', items: { type: 'string' }, initial: ['a'] },
    }
    const read = (/** @type {any} */ _m, /** @type {any} */ ctx) => ({
      ...ctx.state,
      tags: [...ctx.state.tags],
    })
    const run = nodeRun({ state, methods: { read }, instance: { handled: 5, tags: ['x', 'y'] } })
    const reply = ask(run, 'read')
    await run.runToEnd()
    assert.deepEqual(reply.body, { handled: 5, region: 'eu', tags: ['x', 'y'] })
    assert.throws(
      () => nodeRun({ state, methods: { read }, instance: { handled: 'many' } }),
      /** @param {any} err */ err =>
        err.code === 'E_SCHEMA_TYPE' && /state\.handled/.test(err.message)
    )
  })

  it('keeps queues, lists, maps and tables to their shapes', async () => {
    const state = {
      jobs: { type: 'queue', items: { type: 'integer' }, initial: [] },
      names: { type: 'list', items: { type: 'string' }, initial: [] },
      counts: { type: 'map', values: { type: 'integer' }, initial: {} },
      orders: {
        type: 'table',
        columns: { id: { type: 'string' }, qty: { type: 'integer' } },
        initial: [{ id: 'a', qty: 1 }],
      },
    }
    /** @type {Record<string, (msg: any, ctx: any) => unknown>} */
    const methods = {
      goodWrites(_m, ctx) {
        ctx.state.jobs.push(1)
        ctx.state.names.push('n')
        ctx.state.counts.x = 2
        ctx.state.orders.push({ id: 'b', qty: 2 })
        ctx.state.orders.splice(0, 1)
        ctx.state.orders[0].qty = 3
        return ctx.state.orders.length
      },
      queueItem: (_m, ctx) => void ctx.state.jobs.push('one'),
      listItem: (_m, ctx) => void ctx.state.names.push(3),
      mapValue: (_m, ctx) => void (ctx.state.counts.y = 'two'),
      tableColumn: (_m, ctx) => void ctx.state.orders.push({ id: 'c' }),
      tableExtra: (_m, ctx) => void ctx.state.orders.push({ id: 'c', qty: 1, note: 'x' }),
      tableKey: (_m, ctx) => void ctx.state.orders.push({ id: 'b', qty: 9 }),
      tableCell: (_m, ctx) => void (ctx.state.orders[0].qty = 'lots'),
      tableNewColumn: (_m, ctx) => void (ctx.state.orders[0].note = 'x'),
      wholeField: (_m, ctx) => void (ctx.state.jobs = {}),
    }
    const run = nodeRun({ state, methods })
    const replies = Object.fromEntries(Object.keys(methods).map(m => [m, ask(run, m)]))
    await run.runToEnd()
    assert.deepEqual([replies.goodWrites.status, replies.goodWrites.body], ['ok', 1])
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(replies)
          .slice(1)
          .map(([m, r]) => [m, r.error?.code])
      ),
      {
        queueItem: 'E_SCHEMA_TYPE',
        listItem: 'E_SCHEMA_TYPE',
        mapValue: 'E_SCHEMA_TYPE',
        tableColumn: 'E_SCHEMA_FIELD',
        tableExtra: 'E_SCHEMA_FIELD',
        tableKey: 'E_SCHEMA_KEY',
        tableCell: 'E_SCHEMA_TYPE',
        tableNewColumn: 'E_SCHEMA_FIELD',
        wholeField: 'E_SCHEMA_TYPE',
      }
    )
    assert.match(String(replies.queueItem.error?.message), /state\.jobs\[1\]/)
  })

  it('records every state change with its event number and method span', async () => {
    const run = nodeRun({
      state: {
        jobs: { type: 'queue', items: { type: 'string' }, initial: [] },
        count: { type: 'integer', initial: 0 },
      },
      methods: {
        add(/** @type {any} */ msg, /** @type {any} */ ctx) {
          ctx.state.jobs.push(msg.body.job)
          ctx.call('bump')
        },
        take: (/** @type {any} */ _m, /** @type {any} */ ctx) => ctx.state.jobs.shift(),
      },
      privates: {
        bump: (/** @type {any} */ _a, /** @type {any} */ ctx) => void (ctx.state.count += 1),
      },
    })
    ask(run, 'add', { job: 'j1' }, 0)
    const taken = ask(run, 'take', {}, 1000)
    await run.runToEnd()
    assert.equal(taken.body, 'j1')
    const span = (/** @type {string} */ method) => run.spans.find(s => s.method === method)?.spanId
    assert.deepEqual(run.changes, [
      { event: 1, spanId: span('add'), node: 'store', op: 'set', path: ['jobs', 0], value: 'j1' },
      {
        event: 1,
        spanId: span('add'),
        node: 'store',
        op: 'set',
        path: ['jobs', 'length'],
        value: 1,
      },
      { event: 1, spanId: span('bump'), node: 'store', op: 'set', path: ['count'], value: 1 },
      { event: 2, spanId: span('take'), node: 'store', op: 'delete', path: ['jobs', 0] },
      {
        event: 2,
        spanId: span('take'),
        node: 'store',
        op: 'set',
        path: ['jobs', 'length'],
        value: 0,
      },
    ])
  })

  it('sends copies, so a caller that changes a response does not change the callee’s state', async () => {
    const run = nodeRun({
      state: { jobs: { type: 'list', items: { type: 'string' }, initial: ['j1'] } },
      methods: {
        list: (/** @type {any} */ _m, /** @type {any} */ ctx) => ctx.state.jobs,
        count: (/** @type {any} */ _m, /** @type {any} */ ctx) => ctx.state.jobs.length,
      },
      extra: [
        {
          id: 'reader',
          manifest: {
            strataApi: '^1.0',
            id: 't.reader',
            name: 'Reader',
            version: '1.0.0',
            extends: 'base:client',
            ports: [
              { name: 'in', direction: 'in', exposes: ['go'] },
              { name: 'out', direction: 'out' },
            ],
            methods: { public: { go: {} } },
          },
          behaviour: {
            public: {
              async go(/** @type {any} */ _m, /** @type {any} */ ctx) {
                const jobs = await ctx.send('out', 'list')
                jobs.push('mine')
                return jobs
              },
            },
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          from: { node: 'reader', port: 'out' },
          to: { node: 'store', port: 'in' },
          props: {},
        },
      ],
    })
    const read = run.inject({ node: 'reader', port: 'in', method: 'go' })
    const count = run.inject({ node: 'store', port: 'in', method: 'count', atUs: 10 })
    await run.runToEnd()
    assert.deepEqual(read.body, ['j1', 'mine'])
    assert.equal(count.body, 1, 'the store still has one job')
  })

  it('loads a table’s rows from a CSV fixture, typed by its columns', async () => {
    const run = nodeRun({
      state: {
        orders: {
          type: 'table',
          columns: {
            id: { type: 'string' },
            qty: { type: 'integer' },
            paid: { type: 'boolean' },
            note: { type: 'string' },
          },
          initial: [],
        },
      },
      methods: { all: (/** @type {any} */ _m, /** @type {any} */ ctx) => ctx.state.orders },
      fixtures: {
        orders: { csv: 'id,qty,paid,note\na,2,true,plain\nb,5,false,"with, a comma"\n' },
      },
    })
    const reply = ask(run, 'all')
    await run.runToEnd()
    assert.deepEqual(reply.body, [
      { id: 'a', qty: 2, paid: true, note: 'plain' },
      { id: 'b', qty: 5, paid: false, note: 'with, a comma' },
    ])
  })
})
