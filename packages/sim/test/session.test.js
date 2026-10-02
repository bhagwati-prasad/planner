// @ts-check
// Run sessions in the simulation worker (task 0417, ADR 0025): the worker keeps runs by id
// between messages. run.start answers with a view of the run, run.control moves it and answers
// with the view of the moment it left it at, run.read reads it in chunks of at most 64 KB, and
// run.close drops it. A long action posts a heartbeat every 250 ms of wall time, and a playing
// run posts views at most every 100 ms of wall time.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeScheduler } from '../../../tools/testing/index.js'
import * as sim from '../src/index.js'

/** A component type for these tests. @param {string} id @param {object} rest */
const type = (id, rest) => ({ strataApi: '^1.0', id, name: id, version: '1.0.0', ...rest })

/** The behaviours the fake sandbox loads, by the script that stands for each. */
const SCRIPTS = /** @type {Record<string, { key: string, behaviour: object }>} */ ({
  api: {
    key: 't.api@1.0.0',
    behaviour: {
      public: {
        async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
          await ctx.spend(2)
          const id = await ctx.send('db', 'insert', msg.body)
          ctx.state.orders++
          return { id }
        },
      },
    },
  },
  db: {
    key: 't.db@1.0.0',
    behaviour: {
      public: { insert: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ++ctx.state.next },
    },
  },
})

/** An API that inserts each order into a database, with `requests` orders 10 ms apart. */
const input = (requests = 3) => ({
  seed: 5,
  nodes: [
    {
      id: 'api',
      manifest: type('t.api', {
        ports: [
          { name: 'in', direction: 'in', exposes: ['order'] },
          { name: 'db', direction: 'out' },
        ],
        state: { orders: { type: 'integer', initial: 0 } },
        methods: { public: { order: {} } },
      }),
      props: {},
    },
    {
      id: 'db',
      manifest: type('t.db', {
        ports: [{ name: 'in', direction: 'in', exposes: ['insert'] }],
        state: { next: { type: 'integer', initial: 0 } },
        methods: { public: { insert: {} } },
      }),
      props: {},
    },
  ],
  edges: [
    {
      id: 'inserts',
      from: { node: 'api', port: 'db' },
      to: { node: 'db', port: 'in' },
      props: { latency: 1 },
    },
  ],
  inject: Array.from({ length: requests }, (_, i) => ({
    node: 'api',
    port: 'in',
    method: 'order',
    body: { n: i, note: 'x'.repeat(40) },
    atUs: i * 10_000,
  })),
})

/**
 * A worker session with a fake sandbox, a fake scheduler and a wall clock that moves `wallStep`
 * ms each time it is read, or follows the scheduler's clock.
 */
function session({ wallStep = /** @type {number|null} */ (null) } = {}) {
  const scheduler = createFakeScheduler()
  /** @type {any[]} */
  const posted = []
  let wall = 0
  const wallMs = () => (wallStep === null ? scheduler.clock.now() : (wall += wallStep))
  const worker = sim.createWorkerSession({
    post: message => posted.push({ ...message, wall: wallStep === null ? wallMs() : wall }),
    sandbox: {
      evaluate(script, define) {
        const { key, behaviour } = SCRIPTS[script]
        define(key, 'index.js', { load: () => ({ default: behaviour }) })
      },
      seal() {},
      use() {},
    },
    scheduler,
    wallMs,
  })
  let next = 0
  /** Sends one request and returns the messages posted with its id. @param {string} type @param {unknown} payload */
  const ask = async (type, payload) => {
    const id = ++next
    await worker.handle({ v: sim.PROTOCOL_VERSION, type, id, payload })
    return posted.filter(m => m.id === id)
  }
  /** The reply to a request: its last message. @param {string} type @param {unknown} payload */
  const reply = async (type, payload) => /** @type {any} */ ((await ask(type, payload)).at(-1))
  return { scheduler, posted, ask, reply }
}

/** Starts a run of `requests` orders, paused at time zero. @param {ReturnType<typeof session>} s */
async function paused(s, requests = 3) {
  await s.reply('load', { scripts: ['api', 'db'] })
  const started = await s.reply('run.start', { input: input(requests), durationMs: 10_000 })
  const run = started.payload.run
  await s.reply('run.control', { run, action: 'play' })
  await s.reply('run.control', { run, action: 'pause' })
  return { run, started }
}

describe('run sessions in the worker', () => {
  it('keeps runs by id: run.start, run.control, run.read and run.close', async () => {
    const s = session()
    const { run, started } = await paused(s)
    assert.equal(started.type, 'run.view')
    assert.equal(started.payload.status, 'ready')
    assert.deepEqual(started.payload.components, { api: { orders: 0 }, db: { next: 0 } })

    const stepped = await s.reply('run.control', {
      run,
      action: 'step',
      args: { n: 4, unit: 'hop' },
    })
    assert.equal(stepped.type, 'run.view')
    assert.equal(stepped.payload.status, 'paused')
    assert.ok(stepped.payload.position.event > 0)

    const end = await s.reply('run.control', { run, action: 'runToEnd' })
    assert.equal(end.payload.status, 'finished')
    assert.deepEqual(end.payload.components, { api: { orders: 3 }, db: { next: 3 } })
    assert.deepEqual(
      end.payload.metrics,
      [],
      'the components reported no metrics, and the view says so'
    )

    const spans = await s.reply('run.read', { run, what: 'spans' })
    assert.equal(spans.type, 'run.data')
    assert.deepEqual([spans.payload.chunk, spans.payload.of], [0, 1])
    assert.equal(
      spans.payload.data.filter((/** @type {any} */ x) => x.kind === 'public').length,
      6,
      'three orders and three inserts'
    )
    const hash = await s.reply('run.read', { run, what: 'hash' })
    assert.match(hash.payload.data, /^[0-9a-f]{64}$/)

    assert.equal((await s.reply('run.close', { run })).type, 'run.closed')
    const gone = await s.reply('run.control', { run, action: 'play' })
    assert.equal(gone.type, 'error')
    assert.equal(gone.payload.code, 'E_RUN_NOT_FOUND')
  })

  it('gives a branch its own id, and refuses to move a run that went on as a branch', async () => {
    const s = session()
    const { run } = await paused(s)
    await s.reply('run.control', { run, action: 'step', args: { n: 2, unit: 'hop' } })
    const edited = await s.reply('run.control', {
      run,
      action: 'edit',
      args: { edit: { kind: 'state', node: 'db', path: ['next'], value: 100 } },
    })
    assert.deepEqual(edited.payload.continuations, ['resume', 'replay', 'restart'])
    const branch = await s.reply('run.control', { run, action: 'replayFromHere' })
    assert.equal(branch.type, 'run.view')
    assert.notEqual(branch.payload.run, run)
    assert.deepEqual(
      branch.payload.runs.map((/** @type {any} */ r) => [r.id, r.parent]),
      [
        [run, null],
        [branch.payload.run, run],
      ]
    )
    const refused = await s.reply('run.control', { run, action: 'play' })
    assert.equal(refused.payload.code, 'E_RUN_STATE')
    const parent = await s.reply('run.read', { run, what: 'view' })
    assert.equal(parent.payload.data.status, 'paused', 'the parent stays where it branched')
  })

  it('posts a heartbeat every 250 ms of wall time inside a long action', async () => {
    const s = session({ wallStep: 1 })
    const { run } = await paused(s, 200)
    const messages = await s.ask('run.control', { run, action: 'runToEnd' })
    const beats = messages.filter(m => m.type === 'heartbeat')
    assert.ok(beats.length >= 2, `heartbeats: ${beats.length}`)
    assert.deepEqual(beats[0].payload, { run })
    for (let i = 1; i < beats.length; i++)
      assert.ok(beats[i].wall - beats[i - 1].wall >= 250, 'at most one every 250 ms')
    assert.equal(messages.at(-1).payload.status, 'finished')
  })

  it('posts views while playing, at most every 100 ms of wall time, and one when it finishes', async () => {
    const s = session()
    await s.reply('load', { scripts: ['api', 'db'] })
    const started = await s.reply('run.start', { input: input(20), durationMs: 300 })
    const run = started.payload.run
    await s.reply('run.control', { run, action: 'play' })
    for (let i = 0; i < 40; i++) {
      s.scheduler.advance(16)
      await s.reply('run.read', { run, what: 'view' })
    }
    const views = s.posted.filter(m => m.type === 'run.view' && m.id === null)
    assert.ok(views.length >= 2, `views: ${views.length}`)
    for (let i = 1; i < views.length - 1; i++)
      assert.ok(views[i].wall - views[i - 1].wall >= 100, 'at most one every 100 ms')
    assert.equal(views.at(-1).payload.status, 'finished')
    assert.equal(views.at(-1).payload.run, run)
  })

  it('answers a read in chunks of at most 64 KB', async () => {
    const s = session()
    const { run } = await paused(s, 300)
    await s.reply('run.control', { run, action: 'runToEnd' })
    const chunks = (await s.ask('run.read', { run, what: 'spans' })).filter(
      m => m.type === 'run.data'
    )
    assert.ok(chunks.length > 1, `chunks: ${chunks.length}`)
    chunks.forEach((m, i) => {
      assert.deepEqual([m.payload.chunk, m.payload.of], [i, chunks.length])
      assert.ok(JSON.stringify(m.payload.data).length <= 64_000)
    })
    const spans = chunks.flatMap(m => m.payload.data)
    assert.equal(spans.filter(x => x.kind === 'public').length, 600)
  })
})
