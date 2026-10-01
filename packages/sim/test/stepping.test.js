// @ts-check
// Snapshots, step units and time travel (task 0413, spec §12 "Step units", "Scrubber and
// markers", eng §13 "Snapshots, stepping and branches", ADR 0023): a run takes snapshots at quiet
// moments; stepping back or seeking restores the latest one and replays forward, so stepping
// forward n then back n, in any unit, restores an identical state, and a seek to a time gives the
// state of a run to that time from zero. A memory cap thins old snapshots without making seeks
// inexact.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gen, sample } from '../../../tools/testing/index.js'
import * as sim from '../src/index.js'

const MS = 1000
const uniform = (/** @type {number} */ min, /** @type {number} */ max) => ({
  kind: 'uniform',
  min,
  max,
})

/** A component type for these tests. @param {string} id @param {object} rest */
const type = (id, rest) => ({ strataApi: '^1.0', id, name: id, version: '1.0.0', ...rest })

/**
 * A small, busy shop: a client orders every 5 to 15 ms over a lossy edge with timeouts and
 * retries; the API waits on two servers with a backlog, spends a moment and inserts into the
 * database, whose insert takes a declared latency. Methods await, timers fire, calls queue and
 * retries happen, so a snapshot has every kind of pending work to keep.
 * @param {{ snapshotEvery?: number, snapshotBytes?: number }} [options]
 */
function shop(options = {}) {
  return sim.createRun({
    seed: 7,
    ...options,
    nodes: [
      {
        id: 'client',
        manifest: type('t.client', {
          ports: [{ name: 'out', direction: 'out' }],
          state: { sent: { type: 'integer', initial: 0 } },
          methods: { public: {} },
        }),
        behaviour: {
          init: (/** @type {any} */ ctx) => ctx.schedule(0, 'tick'),
          async onTimer(/** @type {any} */ _timer, /** @type {any} */ ctx) {
            ctx.schedule(5 + ctx.random() * 10, 'tick')
            try {
              await ctx.send('out', 'order', { n: ++ctx.state.sent })
              ctx.metric('ordered', 1)
            } catch {
              ctx.metric('failed', 1)
            }
          },
        },
      },
      {
        id: 'api',
        manifest: type('t.api', {
          ports: [
            { name: 'in', direction: 'in', exposes: ['order'] },
            { name: 'db', direction: 'out' },
          ],
          servers: { count: [2], backlog: 3, timeout: 20 },
          state: { orders: { type: 'list', initial: [] } },
          methods: { public: { order: {} } },
        }),
        behaviour: {
          public: {
            async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
              await ctx.spend(uniform(1, 8))
              const id = await ctx.send('db', 'insert', { n: msg.body.n })
              ctx.state.orders.push(id)
              return { id }
            },
          },
        },
      },
      {
        id: 'db',
        manifest: type('t.db', {
          ports: [{ name: 'in', direction: 'in', exposes: ['insert'] }],
          state: {
            next: { type: 'integer', initial: 0 },
            rows: { type: 'map', initial: {} },
          },
          methods: { public: { insert: { latency: uniform(0.5, 2) } } },
        }),
        behaviour: {
          public: {
            insert(/** @type {any} */ msg, /** @type {any} */ ctx) {
              const id = ++ctx.state.next
              ctx.state.rows[id] = msg.body
              return id
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'orders',
        from: { node: 'client', port: 'out' },
        to: { node: 'api', port: 'in' },
        props: {
          latency: uniform(1, 3),
          timeout: 30,
          retries: 1,
          retryBackoff: 5,
          retryJitter: 0.2,
          packetLoss: 0.02,
        },
      },
      {
        id: 'inserts',
        from: { node: 'api', port: 'db' },
        to: { node: 'db', port: 'in' },
        props: { latency: 1 },
      },
    ],
  })
}

/** Where a run is, and its state hash. @param {any} run */
const where = run => ({ ...run.position, hash: run.stateHash() })

describe('time travel', () => {
  it('restores an identical state after stepping forward n then back n, in every unit', async () => {
    const cases = sample(gen.tuple(gen.int(0, 6), gen.int(1, 6)), { seed: 13, count: 6 })
    const probe = shop({ snapshotEvery: 150 })
    await probe.runToEnd({ untilUs: 40 * MS })
    const trace = probe.spans.find(s => s.node === 'api' && s.kind === 'public')?.traceId
    assert.ok(trace)
    /** @type {[string, (m: number) => number, object][]} */
    const units = [
      ['event', m => m * 97, {}],
      ['hop', m => m * 23, {}],
      ['call', m => m * 31, {}],
      ['followed', m => m % 3, { trace }],
      ['time', m => m * 17, { sliceMs: 7 }],
    ]
    for (const [unit, scale, options] of units)
      for (const [m, n] of cases) {
        const run = shop({ snapshotEvery: 150 })
        // A moment in time is after every event up to it, so time steps start from one.
        if (unit === 'time') await run.seek({ timeUs: scale(m) * 7 * MS })
        else await run.step(scale(m), unit, options)
        const before = where(run)
        // One request makes four hops, so a followed request is stepped at most four.
        const k = unit === 'event' ? n * 41 : unit === 'followed' ? 1 + (n % 2) : n
        await run.step(k, unit, options)
        assert.notDeepEqual(where(run), before, `${unit}: stepping forward ${k} moved`)
        await run.step(-k, unit, options)
        assert.deepEqual(where(run), before, `${unit}: forward ${k} then back ${k} from ${m}`)
      }
  })

  it('gives the same state when seeking to a time as when running to it from zero', async () => {
    const run = shop({ snapshotEvery: 200 })
    await run.runToEnd({ untilUs: 1500 * MS })
    assert.ok(run.snapshots.length > 3, `${run.snapshots.length} snapshots`)
    for (const ms of [734.567, 12, 1203, 1499.9, 400]) {
      await run.seek({ timeUs: Math.round(ms * MS) })
      const fresh = shop({ snapshotEvery: 200 })
      await fresh.runToEnd({ untilUs: Math.round(ms * MS) })
      assert.deepEqual(where(run), where(fresh), `at ${ms} ms`)
    }
    const fresh = shop()
    await fresh.runToEnd({ untilEvent: 777 })
    await run.seek({ event: 777 })
    assert.deepEqual(where(run), where(fresh), 'at event 777')
  })

  it('takes snapshots from time zero, only when no method is waiting part-way', async () => {
    const run = shop({ snapshotEvery: 100 })
    await run.runToEnd({ untilUs: 600 * MS })
    const taken = run.snapshots.map((/** @type {any} */ s) => s.event)
    assert.equal(taken[0], 0)
    for (let i = 1; i < taken.length - 1; i++)
      assert.ok(taken[i] - taken[i - 1] >= 100, `snapshot ${i} at event ${taken[i]}`)
    const restored = shop({ snapshotEvery: 100 })
    for (const snapshot of run.snapshots) {
      await restored.seek({ event: snapshot.event })
      const fresh = shop()
      await fresh.runToEnd({ untilEvent: snapshot.event })
      assert.equal(restored.stateHash(), fresh.stateHash(), `snapshot at ${snapshot.event}`)
    }
  })

  it('thins old snapshots under its memory cap without making seeks inexact', async () => {
    const capped = shop({ snapshotEvery: 50, snapshotBytes: 25_000 })
    const free = shop({ snapshotEvery: 50 })
    await capped.runToEnd({ untilUs: 1500 * MS })
    await free.runToEnd({ untilUs: 1500 * MS })
    assert.ok(capped.snapshotBytes <= 25_000, `${capped.snapshotBytes} bytes kept`)
    assert.ok(capped.snapshots.length < free.snapshots.length)
    assert.equal(capped.snapshots[0].event, 0, 'time zero is always kept')
    assert.deepEqual(
      capped.snapshots.at(-1).event,
      free.snapshots.at(-1).event,
      'the latest is kept'
    )
    for (const ms of [90, 650, 1310]) {
      await capped.seek({ timeUs: ms * MS })
      await free.seek({ timeUs: ms * MS })
      assert.deepEqual(where(capped), where(free), `at ${ms} ms`)
    }
  })

  it('snapshots state that holds a view of another part of it', async () => {
    const run = sim.createRun({
      seed: 1,
      snapshotEvery: 1,
      nodes: [
        {
          id: 'it',
          manifest: type('t.nest', {
            ports: [{ name: 'in', direction: 'in', exposes: ['keep'] }],
            state: {
              rows: { type: 'map', initial: { a: { n: 1 } } },
              kept: { type: 'map', initial: {} },
            },
            methods: { public: { keep: {} } },
          }),
          behaviour: {
            public: {
              keep(/** @type {any} */ _msg, /** @type {any} */ ctx) {
                // `??=` gives the object it stores, not a view of it, so the view of rows.a
                // goes into state as it is.
                const kept = (ctx.state.kept.k ??= {})
                kept.row = ctx.state.rows.a
                return null
              },
            },
          },
        },
      ],
    })
    run.inject({ node: 'it', port: 'in', method: 'keep', atUs: 1000 })
    run.inject({ node: 'it', port: 'in', method: 'keep', atUs: 2000 })
    await run.runToEnd()
    const end = where(run)
    await run.seek({ event: 1 })
    await run.seek({ event: 2 })
    assert.deepEqual(where(run), end)
  })

  it('replays requests injected after a snapshot at the moment they were injected', async () => {
    const run = shop({ snapshotEvery: 100 })
    await run.runToEnd({ untilUs: 300 * MS })
    const reply = run.inject({
      node: 'db',
      port: 'in',
      method: 'insert',
      body: { n: -1 },
      atUs: 320 * MS,
    })
    await run.runToEnd({ untilUs: 400 * MS })
    const after = where(run)
    assert.equal(reply.status, 'ok')
    await run.seek({ timeUs: 250 * MS })
    assert.equal(reply.status, 'pending', 'its reply is pending again before it ran')
    await run.seek({ timeUs: 400 * MS })
    assert.deepEqual(where(run), after)
    assert.equal(reply.status, 'ok')
  })
})
