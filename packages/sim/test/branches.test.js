// @ts-check
// Editing a paused run and branch runs (task 0415, spec §12 "Editing a paused run", "Run tree",
// eng §13 "Snapshots, stepping and branches"): run-only edits; resume with changes, replay from
// here and restart with changes; keep in model or discard; the run tree and run comparison.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCore, createPrng, createRegistry } from '../../core/src/index.js'
import { createFakeScheduler } from '../../../tools/testing/index.js'
import {
  buildRecursivePayments,
  registerFixtureTypes,
} from '../../../tools/fixtures/recursive-payments.js'
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
 * A client that orders every 5 to 15 ms from an API on `concurrency` servers, which inserts into
 * a database.
 */
const shop = () => ({
  seed: 5,
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
        servers: { count: ['concurrency'] },
        properties: { concurrency: { type: 'integer', default: 1 } },
        state: { orders: { type: 'integer', initial: 0 } },
        methods: { public: { order: {} } },
      }),
      behaviour: {
        public: {
          async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
            await ctx.spend(uniform(2, 10))
            const id = await ctx.send('db', 'insert', { n: msg.body.n })
            ctx.state.orders++
            return { id }
          },
        },
      },
    },
    {
      id: 'db',
      manifest: type('t.db', {
        ports: [{ name: 'in', direction: 'in', exposes: ['insert'] }],
        state: { next: { type: 'integer', initial: 0 } },
        methods: { public: { insert: { latency: uniform(0.5, 2) } } },
      }),
      behaviour: {
        public: { insert: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ++ctx.state.next },
      },
    },
  ],
  edges: [
    {
      id: 'orders',
      from: { node: 'client', port: 'out' },
      to: { node: 'api', port: 'in' },
      props: { latency: uniform(1, 3) },
    },
    {
      id: 'inserts',
      from: { node: 'api', port: 'db' },
      to: { node: 'db', port: 'in' },
      props: { latency: 1 },
    },
  ],
})

/** A control over a run, paused at `ms`. @param {any} [input] */
async function pausedAt(ms, input = shop()) {
  const c = sim.createControl(input, { scheduler: createFakeScheduler(), durationMs: 1000 })
  await c.play()
  await c.pause()
  await c.seek({ timeUs: ms * MS })
  return c
}

/** Whether a promise rejects with a code. @param {() => Promise<unknown>} action @param {string} code */
const refused = async (action, code) =>
  action().then(
    () => false,
    err => err?.code === code
  )

/** The values of a metric a node reported, before and after a time. @param {any} run */
function split(run, node, name, atUs) {
  const values = run.metrics.filter((/** @type {any} */ m) => m.node === node && m.name === name)
  return {
    before: values
      .filter((/** @type {any} */ m) => m.atUs < atUs)
      .map((/** @type {any} */ m) => m.value),
    after: values
      .filter((/** @type {any} */ m) => m.atUs > atUs)
      .map((/** @type {any} */ m) => m.value),
  }
}

describe('editing a paused run', () => {
  it('resumes with a capacity change in effect from the current moment only', async () => {
    const c = await pausedAt(500)
    c.edit({ kind: 'props', node: 'api', props: { concurrency: 4 } })
    assert.deepEqual(c.continuations(), ['resume', 'replay', 'restart'])
    await c.resume()
    assert.equal(c.state, 'playing')
    await c.pause()
    await c.seek({ timeUs: 700 * MS })
    const at700 = c.run.stateHash()
    await c.seek({ timeUs: 200 * MS })
    await c.seek({ timeUs: 700 * MS })
    assert.equal(c.run.stateHash(), at700, 'the edit is part of the run, at its moment')
    await c.runToEnd()
    const { before, after } = split(c.run, 'api', 'utilisation', 500 * MS)
    assert.ok(before.length && after.length)
    assert.ok(
      before.every(v => v === 0 || v === 1),
      'one server before the edit'
    )
    assert.ok(
      after.every(v => [0, 0.25, 0.5, 0.75, 1].includes(v)) && after.some(v => v > 0 && v < 1),
      'four servers after it'
    )
    assert.deepEqual(
      c.edits.map((/** @type {any} */ e) => [e.kind, e.node, e.at.timeUs]),
      [['props', 'api', 500 * MS]]
    )
  })

  it('replays from here as a branch that shares its parent’s history, with a hash over the parent hash, branch point and edits', async () => {
    const c = await pausedAt(400)
    const root = c.current
    const point = { ...c.run.position }
    const parentSpans = structuredClone(c.run.spans)
    c.edit({ kind: 'props', node: 'api', props: { concurrency: 3 } })
    const branch = await c.replayFromHere()
    assert.equal(c.state, 'playing')
    await c.pause()
    assert.equal(c.current, branch)
    assert.deepEqual(
      c.runs.map((/** @type {any} */ r) => [r.id, r.parent]),
      [
        [root.id, null],
        [branch.id, root.id],
      ]
    )
    assert.deepEqual(branch.branchPoint, point)
    assert.equal(branch.seed, root.seed)
    const edits = [{ kind: 'props', node: 'api', props: { concurrency: 3 } }]
    assert.equal(branch.hash, sim.branchHash({ parent: root.hash, branchPoint: point, edits }))
    assert.notEqual(
      branch.hash,
      sim.branchHash({
        parent: root.hash,
        branchPoint: { ...point, event: point.event - 1 },
        edits,
      })
    )
    assert.notEqual(
      branch.hash,
      sim.branchHash({
        parent: root.hash,
        branchPoint: point,
        edits: [{ kind: 'props', node: 'api', props: { concurrency: 2 } }],
      })
    )
    const shared = root.run.snapshots.filter((/** @type {any} */ s) => s.event <= point.event)
    assert.ok(shared.length > 0)
    shared.forEach((/** @type {any} */ s, /** @type {number} */ i) =>
      assert.equal(
        branch.run.snapshots[i],
        s,
        'the branch keeps its parent’s snapshots, not copies'
      )
    )
    assert.deepEqual(
      structuredClone(branch.run.spans.slice(0, parentSpans.length)).map(
        (/** @type {any} */ s) => s.spanId
      ),
      parentSpans.map((/** @type {any} */ s) => s.spanId),
      'the branch’s trace begins with its parent’s'
    )

    const again = await pausedAt(400)
    again.edit({ kind: 'props', node: 'api', props: { concurrency: 3 } })
    const twin = await again.replayFromHere()
    await again.pause()
    await again.runToEnd()
    await c.runToEnd()
    assert.equal(twin.hash, branch.hash)
    assert.equal(twin.run.stateHash(), branch.run.stateHash(), 'a branch is reproducible')
  })

  it('offers only replay or restart after a code or structural edit', async () => {
    const c = await pausedAt(300)
    c.edit({
      kind: 'code',
      node: 'db',
      behaviour: {
        public: {
          insert: (/** @type {any} */ _msg, /** @type {any} */ ctx) => (ctx.state.next += 10),
        },
      },
    })
    assert.deepEqual(c.continuations(), ['replay', 'restart'])
    assert.ok(await refused(() => c.resume(), 'E_RUN_EDIT'))
    const before = c.run.spans.filter((/** @type {any} */ s) => s.node === 'db').length
    await c.replayFromHere()
    await c.pause()
    await c.runToEnd()
    const inserts = c.run.spans.filter((/** @type {any} */ s) => s.node === 'db').length
    const next = c.run.stateOf('db').next
    assert.equal(next, before + (inserts - before) * 10, 'inserts after the edit count ten')

    const s = await pausedAt(300)
    s.edit({ kind: 'structure', remove: { edges: ['inserts'] } })
    assert.deepEqual(s.continuations(), ['replay', 'restart'])

    const busy = sim.createControl(shop(), { scheduler: createFakeScheduler(), durationMs: 1000 })
    await busy.play()
    await busy.pause()
    busy.setBreakpoint({ node: 'db', method: 'insert' })
    await busy.runToEnd()
    busy.edit({ kind: 'structure', remove: { nodes: ['db'] } })
    assert.deepEqual(
      busy.continuations(),
      ['restart'],
      'a component with work on its way cannot leave a running run'
    )
    assert.ok(await refused(() => busy.replayFromHere(), 'E_RUN_EDIT'))
    await busy.restartWithChanges()
    assert.equal(busy.state, 'ready')
    await busy.play()
    await busy.pause()
    await busy.runToEnd()
    assert.ok(!busy.run.spans.some((/** @type {any} */ sp) => sp.node === 'db'), 'no database')
  })

  it('keeps run-only edits in the model as undoable commands, and leaves the model alone on discard', async () => {
    const registry = createRegistry()
    registerFixtureTypes(registry)
    const prng = createPrng(1)
    const core = createCore({
      clock: () => Date.UTC(2026, 9, 2),
      random: n => prng.bytes(n),
      registry,
      actorId: 'tester',
    })
    const ids = buildRecursivePayments(core)
    const service = `${ids.payments}/${ids.service}`
    const input = { seed: 1, ...sim.planRun(core, {}) }
    const before = core.get('node', ids.service).props.serviceTime
    const c = sim.createControl(input, { scheduler: createFakeScheduler() })
    await c.play()
    await c.pause()
    c.edit({ kind: 'props', node: service, props: { serviceTime: 55 } })
    c.edit({ kind: 'state', node: service, path: ['notes'], value: 'run only' })
    const { commands, notKept } = c.keepInModel()
    assert.deepEqual(commands, [
      { type: 'node.setProps', payload: { id: ids.service, props: { serviceTime: 55 } } },
    ])
    assert.deepEqual(
      notKept.map((/** @type {any} */ e) => e.kind),
      ['state'],
      'state lives only in runs'
    )
    core.transaction(() => commands.forEach((/** @type {any} */ cmd) => core.dispatch(cmd)))
    assert.deepEqual(
      core.get('node', ids.service).props.serviceTime,
      { kind: 'constant', value: 55 },
      'the model keeps a distribution in its canonical form'
    )
    core.undo()
    assert.equal(core.get('node', ids.service).props.serviceTime, before)
    assert.deepEqual(c.edits, [], 'kept edits are no longer run-only')

    const model = core.stateHash()
    c.edit({ kind: 'props', node: service, props: { serviceTime: 99 } })
    c.discard()
    assert.deepEqual(c.edits, [])
    assert.equal(core.stateHash(), model)
  })

  it('compares two runs at the same moment: their metric and state differences', async () => {
    const c = await pausedAt(400)
    const root = c.current
    c.edit({ kind: 'props', node: 'api', props: { concurrency: 4 } })
    const branch = await c.replayFromHere()
    await c.pause()
    await c.runToEnd()
    const same = await sim.compareRuns(root.run, branch.run, { timeUs: 400 * MS })
    assert.deepEqual(same, { metrics: [], state: [] }, 'they share everything up to the branch')
    const later = await sim.compareRuns(root.run, branch.run, { timeUs: 900 * MS })
    assert.ok(
      later.metrics.some((/** @type {any} */ m) => m.node === 'api' && m.name === 'utilisation'),
      JSON.stringify(later.metrics)
    )
    assert.ok(later.state.length > 0)
    for (const diff of later.state) assert.notDeepEqual(diff.a, diff.b)
  })
})
