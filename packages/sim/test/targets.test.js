// @ts-check
// Targets (ADR 0022): ctx.targets(port) lists the edges leaving a port, in the order the run was
// given them, and ctx.send and ctx.emit take an `edge` that sends over that edge, skipping its
// route rules, so a component such as a load balancer chooses its own target.
import { it } from 'node:test'
import assert from 'node:assert/strict'
import * as sim from '../src/index.js'

/** A server that answers `get` with its own name. @param {string} name */
const server = name => ({
  id: name,
  manifest: {
    strataApi: '^1.0',
    id: `t.${name}`,
    name,
    version: '1.0.0',
    ports: [{ name: 'in', direction: 'in', exposes: ['get'] }],
    methods: { public: { get: {} } },
  },
  behaviour: { public: { get: () => name } },
})

it('lists the edges leaving a port in a stable order, and sends over the edge a method names', async () => {
  const run = sim.createRun({
    seed: 1,
    nodes: /** @type {any} */ ([
      {
        id: 'lb',
        manifest: {
          strataApi: '^1.0',
          id: 't.lb',
          name: 'Balancer',
          version: '1.0.0',
          ports: [
            { name: 'in', direction: 'in', exposes: ['pick'] },
            { name: 'out', direction: 'out' },
          ],
          methods: { public: { pick: {} } },
        },
        behaviour: {
          public: {
            async pick(/** @type {any} */ msg, /** @type {any} */ ctx) {
              const targets = ctx.targets('out')
              const chosen = targets[msg.body]
              let reply
              try {
                reply = await ctx.send('out', 'get', null, { edge: chosen?.edge ?? 'nowhere' })
              } catch (err) {
                reply = /** @type {any} */ (err).code
              }
              return { targets, reply }
            },
          },
        },
      },
      server('a'),
      server('b'),
      server('c'),
    ]),
    edges: [
      { id: 'e1', from: { node: 'lb', port: 'out' }, to: { node: 'a', port: 'in' } },
      {
        id: 'e2',
        from: { node: 'lb', port: 'out' },
        to: { node: 'b', port: 'in' },
        props: { route: ['weight 3'] },
      },
      {
        id: 'e3',
        from: { node: 'lb', port: 'out' },
        to: { node: 'c', port: 'in' },
        props: { route: ['path /never'] },
      },
    ],
  })
  const replies = [2, 0, 1, 9].map(i =>
    run.inject({ node: 'lb', port: 'in', method: 'pick', body: i })
  )
  await run.runToEnd()
  assert.deepEqual(replies[0].body, {
    targets: [
      { edge: 'e1', node: 'a', weight: 1 },
      { edge: 'e2', node: 'b', weight: 3 },
      { edge: 'e3', node: 'c', weight: 1 },
    ],
    reply: 'c',
  })
  assert.deepEqual(
    replies.map(r => /** @type {any} */ (r.body).reply),
    ['c', 'a', 'b', 'E_SIM_EDGE_NOT_FOUND'],
    'a named edge skips its route rules; an edge that does not leave the port fails'
  )
})
