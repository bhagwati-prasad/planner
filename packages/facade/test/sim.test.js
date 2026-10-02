// @ts-check
// strata.sim (spec §11, §12, §18): strata.sim.once, the walking skeleton's one request over one
// edge of a system with the latencies the model's properties give (tasks 0009, 0010), and
// strata.sim.start, a run handle with every control of spec §12 over the worker protocol's run
// sessions (task 0417, ADR 0025), each run by an injected simulation host.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFakeClock, createFakeScheduler, createRandom } from '../../../tools/testing/index.js'
import { createMemoryStorage, createSimHost, createStrata } from '../src/index.js'
import * as sim from '../../sim/src/index.js'
import { createTestStrata } from './fixtures.js'
import { packComponent } from '../../plugins/src/index.js'
import { spawnThreadWorker } from '../../server/src/index.js'
import { simWorkerSource } from '../../../scripts/build.js'
import service from '../../../components/service/index.js'
import relationalDb from '../../../components/relational-db/index.js'

/** @param {string} path */
const manifest = path =>
  JSON.parse(readFileSync(new URL(`../../../${path}/manifest.json`, import.meta.url), 'utf8'))

/**
 * A strata with the starter client, service and HTTP types, and a project open. It runs
 * simulations in the calling thread (strata-sim's inProcessSimHost) unless options say otherwise.
 * @param {object} [options]
 */
async function skeleton(options = {}) {
  const clock = createFakeClock({ start: Date.UTC(2026, 8, 26, 9) })
  const random = createRandom(10)
  const strata = createStrata({
    storage: createMemoryStorage(),
    clock: clock.now,
    random: n => Uint8Array.from({ length: n }, () => random.uint32() & 0xff),
    identity: { id: 'user-1', name: 'Ada' },
    output: () => {},
    simHost: sim.inProcessSimHost,
    ...options,
  })
  for (const path of ['components/client', 'components/service', 'connection-types/http'])
    strata.components.register(manifest(path))
  await strata.projects.create('Skeleton')
  const project = await strata.projects.open('Skeleton')
  const root = project.root
  const client = root.add('client', { name: 'Client' })
  const orders = root.add('service', { name: 'Orders' })
  return { strata, root, client, orders }
}

describe('strata.sim.once', () => {
  it('runs through the simulation host it is given, and without one says how to get one', async () => {
    /** @type {string[]} */
    const requests = []
    const host = {
      /** @param {any} message */
      request: async message => {
        requests.push(message.type)
        return sim.handleMessage(message)
      },
    }
    const given = await skeleton({ simHost: host })
    given.root.connect(given.client.port('out'), given.orders.port('in'), { type: 'http' })
    const run = await given.strata.sim.once({ seed: 42 })
    assert.equal(run.response?.status, 'ok')
    assert.deepEqual(requests, ['run'])

    const none = await skeleton({ simHost: undefined })
    none.root.connect(none.client.port('out'), none.orders.port('in'), { type: 'http' })
    await assert.rejects(none.strata.sim.once({ seed: 42 }), err => {
      assert.equal(/** @type {any} */ (err).code, 'E_SIM_NO_HOST')
      assert.match(/** @type {Error} */ (err).message, /simHost/)
      return true
    })
  })

  it('runs one request over the edge and answers after the latencies the model gives', async () => {
    const { strata, root, client, orders } = await skeleton()
    const edge = root.connect(client.port('out'), orders.port('in'), { type: 'http' })
    const run = await strata.sim.once({ seed: 42 })
    // The HTTP connection's median latency is 1 ms each way; the service's median serviceTime is 20 ms.
    assert.equal(run.response?.atUs, 22_000)
    assert.deepEqual(
      run.trace.map(t => [t.atUs, t.event, t.at, t.message.edge]),
      [
        [0, 'sent', client.id, edge.id],
        [1_000, 'received', orders.id, edge.id],
        [21_000, 'sent', orders.id, edge.id],
        [22_000, 'received', client.id, edge.id],
      ]
    )
    assert.match(run.hash, /^[0-9a-f]{64}$/)
    assert.equal((await strata.sim.once({ seed: 42 })).hash, run.hash)
  })

  it('hands the run to the injected host as a protocol message', async () => {
    /** @type {any[]} */
    const sent = []
    const { strata, root, client, orders } = await skeleton({
      simHost: {
        /** @param {any} message */
        async request(message) {
          sent.push(message)
          return { v: 1, type: 'run.result', id: message.id, payload: { hash: 'from-host' } }
        },
      },
    })
    root.connect(client.port('out'), orders.port('in'), { type: 'http' })
    assert.deepEqual(await strata.sim.once({ seed: 7 }), { hash: 'from-host' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].v, 1)
    assert.equal(sent[0].type, 'run')
    assert.equal(sent[0].payload.seed, 7)
    assert.deepEqual(
      sent[0].payload.model.components.map((/** @type {any} */ c) => [c.name, c.serviceTimeUs]),
      [
        ['Client', 0],
        ['Orders', 20_000],
      ]
    )
  })

  it('fails with E_SIM_NO_EDGE when the system has no edge to send over', async () => {
    const { strata } = await skeleton()
    await assert.rejects(
      () => strata.sim.once(),
      /** @param {any} err */ err => err.code === 'E_SIM_NO_EDGE'
    )
  })

  it('turns an error reply from the host into a StrataError with its code', async () => {
    const { strata, root, client, orders } = await skeleton({
      simHost: {
        /** @param {any} message */
        async request(message) {
          return {
            v: 1,
            type: 'error',
            id: message.id,
            payload: { code: 'E_PROTOCOL_VERSION', message: 'nope' },
          }
        },
      },
    })
    root.connect(client.port('out'), orders.port('in'), { type: 'http' })
    await assert.rejects(
      () => strata.sim.once(),
      /** @param {any} err */ err => err.name === 'StrataError' && err.code === 'E_PROTOCOL_VERSION'
    )
  })
})

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Starter plugins packed as `strata pack` packs them. @param {string[]} folders */
function packed(folders) {
  return folders.map(folder => {
    const dir = join(ROOT, folder)
    /** @type {Record<string, Uint8Array>} */
    const files = {}
    /** @param {string} d */
    const walk = d => {
      for (const entry of readdirSync(d)) {
        const path = join(d, entry)
        if (statSync(path).isDirectory()) walk(path)
        else files[relative(dir, path).split('\\').join('/')] = readFileSync(path)
      }
    }
    walk(dir)
    const { bundle, problems } = packComponent(files, { name: folder.split('/').at(-1) })
    assert.deepEqual(problems, [], `${folder} packs cleanly`)
    return /** @type {any} */ (bundle)
  })
}

const STARTER = packed([
  'components/api-gateway',
  'components/service',
  'components/relational-db',
  'connection-types/http',
  'connection-types/db-protocol',
])

/**
 * A strata with the starter gateway, service and relational DB installed, and a project called
 * checkout, which runs simulations through `simHost`.
 * @param {any} simHost
 */
async function checkout(simHost) {
  const clock = createFakeClock({ start: Date.UTC(2026, 9, 2, 9) })
  const random = createRandom(4)
  const strata = createStrata({
    storage: createMemoryStorage(),
    clock: clock.now,
    random: n => Uint8Array.from({ length: n }, () => random.uint32() & 0xff),
    identity: { id: 'user-1', name: 'Ada' },
    output: () => {},
    simHost,
  })
  for (const bundle of STARTER) strata.components.install(bundle)
  await strata.projects.create('checkout')
  return strata
}

/** The orders service's one endpoint, which inserts each order into the database. */
const ENDPOINTS = [{ name: 'POST /orders', calls: ['out.insert'] }]

/** `n` orders for the service, 5 ms apart. @param {any} to @param {number} n */
const orders = (to, n) =>
  Array.from({ length: n }, (_, i) => ({
    to,
    path: '/orders',
    headers: { method: 'POST' },
    body: { table: 'orders', row: { total: 10 + i } },
    atMs: i * 5,
  }))

/** Whether an error says a namespace or option arrives in a later release. @param {string} release */
const later = release => (/** @type {any} */ err) =>
  err.code === 'UNSUPPORTED' && err.message.includes(release)

describe('strata.sim.start', () => {
  it('runs the spec §18 console example in its R0 form, in a worker_threads worker', async () => {
    const host = createSimHost({
      spawn: spawnThreadWorker(await simWorkerSource()),
      scheduler: createFakeScheduler(),
    })
    const strata = await checkout(host)
    try {
      // Spec §18 in its R0 form: the starter library's names, and requests where a scenario
      // (R1) would drive the run. Each later release turns its lines on.
      const p = await strata.projects.open('checkout')
      const root = p.root

      const gw = root.add('api-gateway', { name: 'Edge GW', props: { rateLimit: 1000 } })
      const svc = root.add('service', { name: 'Orders', props: { endpoints: ENDPOINTS } })
      const db = root.add('relational-db', { name: 'Orders DB' })
      root.connect(gw.port('out'), svc.port('in'), { type: 'http' })
      root.connect(svc.port('out'), db.port('in'), { type: 'db-protocol', method: 'insert' })

      svc.methods() // public and private methods with signatures
      svc.state() // typed initial state
      const inner = svc.openAsSystem() // give any component an inner system
      inner.enter() // drill down; the UI follows if attached
      const system = root.extract([svc.id, db.id], { name: 'Orders System' }) // roll-up
      system.rollup('latency.p99') // derived value

      await assert.rejects(
        strata.sim.start({ scenario: 'checkout', scope: { selection: [svc.id, db.id] }, seed: 42 }),
        later('R1')
      )
      const run = await strata.sim.start({
        requests: orders(svc, 3),
        scope: { selection: [svc.id, db.id] },
        seed: 42,
      })
      await run.stepForward(5, 'hop')
      const forward = run.position
      await run.stepBack(3, 'followedHop')
      const rows = run.state(db).tables.orders ?? {}
      run.edit(db, { props: { maxConnections: 200 } }) // run-only change
      const branch = await run.replayFromHere()
      await branch.runToEnd()
      const diff = strata.sim.compare(run, branch)

      assert.throws(() => strata.test.run({ tags: ['slo'] }), later('R1'))
      assert.throws(
        () => strata.comments.add(svc, 'Should this call be async?', { type: 'question' }),
        later('R0 milestone M6')
      )
      assert.throws(() => strata.docs.render('ADR-003', { format: 'md' }), later('R2'))

      void strata.$ // current UI selection
      strata.print(root) // text tree of the system for console or terminal
      strata.help('sim') // commands with signatures and examples

      assert.equal(run.status, 'paused')
      assert.ok(run.position.event < forward.event, 'back three hops of the first order')
      assert.ok(Object.keys(rows).length < 3, 'not every order is in yet')
      assert.equal(branch.status, 'finished')
      assert.deepEqual(
        Object.values(branch.state(db).tables.orders)
          .map((/** @type {any} */ r) => r.row.total)
          .sort(),
        [10, 11, 12],
        'each order once, in the order the service finished them'
      )
      assert.deepEqual(
        branch.runs.map(r => [r.id, r.parent]),
        [
          [run.id, null],
          [branch.id, run.id],
        ]
      )
      assert.deepEqual(
        branch.runs[1].edits.map(e => [e.kind, e.props]),
        [['props', { maxConnections: 200 }]]
      )
      assert.ok(
        diff.state.some(d => d.node.endsWith(db.id)),
        'the branch inserted orders the paused run has not'
      )
    } finally {
      host.terminate()
    }
  })

  it('gives a run handle every control of spec §12, each answering with the view it leaves', async () => {
    const scheduler = createFakeScheduler()
    const host = sim.createInProcessSimHost({
      behaviours: { 'starter.service': service, 'starter.relational-db': relationalDb },
      scheduler,
      wallMs: scheduler.clock.now,
    })
    const strata = await checkout(host)
    const root = (await strata.projects.open('checkout')).root
    const svc = root.add('service', { name: 'Orders', props: { endpoints: ENDPOINTS } })
    const db = root.add('relational-db', { name: 'Orders DB' })
    root.connect(svc.port('out'), db.port('in'), { type: 'db-protocol', method: 'insert' })

    const run = await strata.sim.start({ requests: orders(svc, 4), seed: 3, durationMs: 200 })
    assert.equal(run.status, 'ready')
    assert.deepEqual(run.position, { event: 0, timeUs: 0 })
    await run.play()
    assert.equal(run.status, 'playing')
    scheduler.advance(16)
    await run.refresh()
    assert.ok(run.position.timeUs > 0, 'a frame of simulated time went by')
    await run.pause()
    assert.equal(run.status, 'paused')

    await run.stepForward(2, 'hop')
    const there = run.position
    await run.stepBack(2, 'hop')
    await run.stepForward(2, 'hop')
    assert.deepEqual(run.position, there, 'forward n then back n then forward n')
    await run.seek({ timeMs: 1 })
    assert.equal(run.position.timeUs, 1000)
    await run.setSpeed(4)
    assert.equal(run.speed, 4)

    const first = (await run.spans()).find((/** @type {any} */ s) => s.kind === 'public')
    await run.follow(first.traceId)
    assert.equal(run.following, first.traceId)
    // The order's insert takes a connection in a private call of the database's.
    /** @param {any} node */
    const where = node => run.frame && [run.frame.node.endsWith(node.id), run.frame.kind]
    await run.stepInto()
    assert.deepEqual(where(db), [true, 'private'])
    await run.stepOut()
    assert.deepEqual(where(db), [true, 'public'], 'back in the insert that called it')

    run.edit(db, { props: { maxConnections: 7 } })
    await run.refresh()
    assert.deepEqual(run.continuations, ['resume', 'replay', 'restart'])
    await run.resume()
    assert.equal(run.status, 'playing')
    await run.pause()
    const { notKept } = await run.keepInModel()
    assert.deepEqual(notKept, [])
    assert.equal(db.props.maxConnections, 7, 'kept in the model')
    strata.undo()
    assert.notEqual(db.props.maxConnections, 7, 'as one undoable change')
    run.edit(db, { state: { path: ['nextId', 'orders'], value: 40 } })
    await run.discard()
    assert.deepEqual(run.edits, [])

    await run.stop()
    assert.equal(run.status, 'stopped')
    const stopped = run.id
    await run.restart()
    assert.equal(run.status, 'ready')
    assert.notEqual(run.id, stopped, 'a restart is a new run in the tree')
    await run.play()
    await run.runToEnd()
    assert.equal(run.status, 'finished')
    assert.equal(Object.keys(run.state(db).tables.orders).length, 4)
    assert.match(await run.hash(), /^[0-9a-f]{64}$/)

    const again = await run.restartWithChanges()
    assert.equal(again.status, 'ready')
    assert.deepEqual(again.runs.at(-1)?.parent, run.id)
    await again.play()
    await again.runToEnd()
    assert.deepEqual(
      strata.sim.compare(run, again),
      { metrics: [], state: [] },
      'no changes, so no differences'
    )
    const early = await strata.sim.compare(run, again, { event: 3 })
    assert.deepEqual(early, { metrics: [], state: [] })

    await run.close()
    await assert.rejects(run.play(), (/** @type {any} */ err) => err.code === 'E_RUN_NOT_FOUND')
  })

  it("lists every control in strata.help('sim') with its signature", () => {
    const { strata } = createTestStrata()
    const text = strata.helpText('sim')
    for (const signature of [
      'strata.sim.start({ requests, scope, seed, modes, stubs, durationMs, speed, inspect, record, scenario })',
      'strata.sim.compare(a, b, { event, timeMs })',
      'strata.sim.once({ system, edge, seed })',
      'run.play()',
      'run.pause()',
      'run.stop()',
      'run.restart()',
      'run.runToEnd()',
      'run.stepForward(n, unit, { sliceMs })',
      'run.stepBack(n, unit, { sliceMs })',
      'run.stepInto()',
      'run.stepOut()',
      'run.seek({ event, timeMs })',
      'run.setSpeed(speed)',
      'run.follow(trace)',
      'run.edit(node, { props, state })',
      'run.resume()',
      'run.replayFromHere()',
      'run.restartWithChanges()',
      'run.keepInModel()',
      'run.discard()',
      'run.state(node)',
      'run.refresh()',
      'run.close()',
    ])
      assert.ok(text.includes(`  ${signature}\n`), `strata.help('sim') lists ${signature}`)
  })
})
