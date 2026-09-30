// @ts-check
// The starter messaging components in a real run (task 0408). Their self-tests use a test
// context, so this runs the message queue, a worker pool and a handler over edges in the
// kernel, with the typed state checks and the routing of ADR 0019.
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as sim from '../src/index.js'
import queue from '../../../components/message-queue/index.js'
import pool from '../../../components/worker-pool/index.js'

const MS = 1000

/** A starter component's manifest. @param {string} name */
const manifestOf = name =>
  JSON.parse(
    readFileSync(new URL(`../../../components/${name}/manifest.json`, import.meta.url), 'utf8')
  )

it('moves messages from the queue through the worker pool to its handler, acknowledging each', async () => {
  /** @type {[unknown, number][]} */
  const handled = []
  const handler = {
    strataApi: '^1.0',
    id: 't.handler',
    name: 'Handler',
    version: '1.0.0',
    extends: 'base:service',
    ports: [{ name: 'in', direction: 'in', exposes: ['handle'] }],
    methods: { public: { handle: {} } },
  }
  const run = sim.createRun({
    seed: 1,
    nodes: /** @type {any} */ ([
      {
        id: 'queue',
        manifest: manifestOf('message-queue'),
        behaviour: queue,
        props: { deliveryDelay: 1 },
      },
      {
        id: 'pool',
        manifest: manifestOf('worker-pool'),
        behaviour: pool,
        props: { consumers: 2, pollInterval: 100, processingTime: 50 },
      },
      {
        id: 'handler',
        manifest: handler,
        behaviour: {
          public: {
            handle(/** @type {any} */ msg, /** @type {any} */ ctx) {
              handled.push([msg.body, ctx.now])
              return null
            },
          },
        },
      },
    ]),
    edges: [
      { id: 'e1', from: { node: 'pool', port: 'source' }, to: { node: 'queue', port: 'in' } },
      {
        id: 'e2',
        from: { node: 'pool', port: 'out' },
        to: { node: 'handler', port: 'in' },
        method: 'handle',
      },
    ],
  })
  for (const [i, body] of ['a', 'b', 'c'].entries())
    run.inject({ node: 'queue', port: 'in', method: 'publish', body, atUs: i * MS })
  await run.runToEnd({ untilUs: 1000 * MS })

  assert.deepEqual(
    handled.map(([body]) => body),
    ['a', 'b', 'c']
  )
  const acked = run.changes
    .filter(c => c.node === 'queue' && c.op === 'delete' && c.path[0] === 'inFlight')
    .map(c => c.path[1])
  assert.deepEqual(acked, ['1', '2', '3'], 'the pool acknowledged each message')
  const throughput = run.metrics.filter(m => m.node === 'pool' && m.name === 'throughput')
  assert.equal(throughput.length, 3)
  assert.deepEqual(
    run.spans.filter(s => s.status === 'error'),
    [],
    'nothing failed'
  )
})
