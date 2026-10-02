// @ts-check
// Scopes, stubs and inbound traffic (task 0412, spec §11 "Scope", eng §13 "Method dispatch,
// scope and stubs"): a scope plans only its components; every edge leaving it ends in a fixed,
// recorded or black-box stub; and traffic recorded at an edge entering it replays at its
// original times.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCore, createPrng, createRegistry } from '../../core/src/index.js'
import {
  buildRecursivePayments,
  registerFixtureTypes,
} from '../../../tools/fixtures/recursive-payments.js'
import * as sim from '../src/index.js'

const MS = 1000

/** The recursive payments fixture (eng §9), built through commands, with run paths. */
function payments() {
  const registry = createRegistry()
  registerFixtureTypes(registry)
  const prng = createPrng(1)
  const core = createCore({
    clock: () => Date.UTC(2026, 9, 1),
    random: n => prng.bytes(n),
    registry,
    actorId: 'tester',
  })
  const ids = buildRecursivePayments(core)
  // A run names each component by its path of node ids from the root.
  const at = {
    payments: ids.payments,
    gateway: `${ids.payments}/${ids.gateway}`,
    service: `${ids.payments}/${ids.service}`,
    queue: `${ids.payments}/${ids.queue}`,
    ledger: `${ids.payments}/${ids.ledger}`,
    ledgerApi: `${ids.payments}/${ids.ledger}/${ids.ledgerApi}`,
    ledgerDb: `${ids.payments}/${ids.ledger}/${ids.ledgerDb}`,
    fraud: `${ids.payments}/${ids.fraud}`,
    rules: `${ids.payments}/${ids.fraud}/${ids.rules}`,
    auth: `${ids.payments}/${ids.authRef}`,
    tokenService: `${ids.payments}/${ids.authRef}/${ids.tokenService}`,
  }
  return { core, ids, at }
}

/** Behaviours for the fixture's component types, by type id. */
const behaviours = {
  'fixture.payment-service': {
    public: {
      async authorise(/** @type {any} */ msg, /** @type {any} */ ctx) {
        const risk = await ctx.send('fraud', 'score', msg.body)
        const token = await ctx.send('auth', 'verify')
        const entry = await ctx.send('ledger', 'record', msg.body)
        return { risk, token, entry }
      },
    },
  },
  'fixture.fraud': { public: { score: () => ({ by: 'fraud check' }) } },
  'fixture.rules-engine': { public: { score: () => ({ by: 'rules engine' }) } },
  'fixture.token-service': { public: { verify: () => ({ valid: true }) } },
  'fixture.ledger-api': { public: { record: () => ({ recorded: true }) } },
}

/** The run id of the edge from one component to another, in the whole project's plan. @param {any} core */
function edgeOf(core, /** @type {string} */ from, /** @type {string} */ to) {
  const edge = sim
    .planRun(core, { behaviours })
    .edges.find(e => e.from.node === from && e.to.node === to)
  return /** @type {string} */ (edge?.id)
}

/** Asks the payment service, or another node, to authorise at each of `times`, in ms. @param {any} run */
const authorise = (run, /** @type {string} */ node, times = [0], method = 'authorise') =>
  times.map(ms => run.inject({ node, port: 'in', method, body: { amount: 10 }, atUs: ms * MS }))

/** The nodes that handled a public call. @param {any} run */
const handlers = run => [
  ...new Set(
    run.spans
      .filter((/** @type {any} */ s) => s.kind === 'public')
      .map((/** @type {any} */ s) => s.node)
  ),
]

describe('scopes and stubs', () => {
  it('instantiates only the selected components, and stubs each edge leaving them', async () => {
    const { core, at } = payments()
    const leaving = sim.planRun(core, { behaviours }).edges.filter(e => e.from.node === at.service)
    const plan = sim.planRun(core, {
      behaviours,
      scope: { kind: 'selection', nodes: [at.service] },
    })
    assert.deepEqual(
      plan.nodes.map(n => n.id).sort(),
      [at.service, ...leaving.map(e => `stub:${e.id}`)].sort()
    )
    assert.deepEqual(
      plan.edges.map(e => [e.from.node, e.to.node]).sort(),
      leaving.map(e => [at.service, `stub:${e.id}`]).sort()
    )
    assert.deepEqual(
      plan.inbound.map(e => [e.from.node, e.to.node]),
      [[at.gateway, at.service]],
      'the edge entering the scope is left for inbound traffic'
    )
    const run = sim.createRun({ seed: 1, ...plan })
    const [reply] = authorise(run, at.service)
    await run.runToEnd()
    assert.deepEqual(
      reply.body,
      { risk: null, token: null, entry: null },
      'a stub answers null by default'
    )
    assert.deepEqual(
      handlers(run).sort(),
      [
        at.service,
        ...['fraud', 'auth', 'ledger'].map(
          n => `stub:${edgeOf(core, at.service, at[/** @type {'fraud'|'auth'|'ledger'} */ (n)])}`
        ),
      ].sort()
    )
  })

  it('runs one system at any depth, entered through its boundary ports', async () => {
    const { core, at } = payments()
    const plan = sim.planRun(core, { behaviours, scope: { kind: 'system', node: at.ledger } })
    assert.deepEqual(
      plan.nodes.map(n => n.id).sort(),
      [at.ledger, at.ledgerApi, at.ledgerDb].sort()
    )
    assert.deepEqual(
      plan.inbound.map(e => e.from.node),
      [at.service]
    )
    const run = sim.createRun({ seed: 1, ...plan })
    const [reply] = authorise(run, at.ledger, [0], 'record')
    await run.runToEnd()
    assert.deepEqual(reply.body, { recorded: true })
  })

  it('answers through a fixed stub with its configured latency distribution and error rate', async () => {
    const { core, at } = payments()
    const fraud = edgeOf(core, at.service, at.fraud)
    const plan = sim.planRun(core, {
      behaviours,
      scope: { kind: 'selection', nodes: [at.service] },
      stubs: {
        [fraud]: {
          mode: 'fixed',
          latency: { kind: 'constant', value: 25 },
          errorRate: 0.2,
          response: { by: 'stub' },
        },
      },
    })
    const run = sim.createRun({ seed: 1, ...plan })
    const replies = authorise(
      run,
      at.service,
      Array.from({ length: 500 }, (_, i) => i * 1000)
    )
    await run.runToEnd()
    const stubbed = run.spans.filter(s => s.node === `stub:${fraud}` && s.kind === 'public')
    assert.equal(stubbed.length, 500)
    assert.deepEqual(
      [...new Set(stubbed.map(s => /** @type {number} */ (s.endUs - s.startUs) / MS))],
      [25]
    )
    const failed = replies.filter(r => r.status === 'error')
    assert.ok(Math.abs(failed.length - 100) < 30, `${failed.length} of 500 failed`)
    assert.deepEqual([...new Set(failed.map(r => r.error?.code))], ['UNAVAILABLE'])
    assert.deepEqual(replies.find(r => r.status === 'ok')?.body, {
      risk: { by: 'stub' },
      token: null,
      entry: null,
    })
  })

  it('replays the responses a wider run recorded at each edge, and fails an unmatched call with E_STUB_NO_RECORDING', async () => {
    const { core, ids, at } = payments()
    const wide = sim.createRun({ seed: 1, record: true, ...sim.planRun(core, { behaviours }) })
    const recorded = authorise(wide, ids.payments, [0, 1000])
    await wide.runToEnd()
    const leaving = sim.planRun(core, { behaviours }).edges.filter(e => e.from.node === at.service)
    const plan = sim.planRun(core, {
      behaviours,
      scope: { kind: 'selection', nodes: [at.service] },
      stubs: Object.fromEntries(
        leaving.map(e => [e.id, { mode: 'recorded', calls: wide.recordings[e.id] ?? [] }])
      ),
    })
    const narrow = sim.createRun({ seed: 1, ...plan })
    const replayed = authorise(narrow, at.service, [0, 1000, 2000])
    await narrow.runToEnd()
    assert.deepEqual(replayed[0].body, {
      risk: { by: 'fraud check' },
      token: { valid: true },
      entry: { recorded: true },
    })
    assert.deepEqual(
      replayed.slice(0, 2).map(r => [r.atUs, r.body]),
      recorded.map(r => [r.atUs, r.body]),
      'each call answers as recorded, after as long'
    )
    assert.equal(replayed[2].error?.code, 'E_STUB_NO_RECORDING')
    assert.match(String(replayed[2].error?.message), /score/)
  })

  it('runs an out-of-scope component as a black box stub, without its inner system', async () => {
    const { core, at } = payments()
    const fraud = edgeOf(core, at.service, at.fraud)
    const plan = sim.planRun(core, {
      behaviours,
      modes: { [at.fraud]: 'expanded' },
      scope: { kind: 'selection', nodes: [at.service] },
      stubs: { [fraud]: { mode: 'blackbox' } },
    })
    assert.ok(plan.nodes.some(n => n.id === at.fraud))
    assert.ok(!plan.nodes.some(n => n.id === at.rules), 'nothing inside it is planned')
    const run = sim.createRun({ seed: 1, ...plan })
    const [reply] = authorise(run, at.service)
    await run.runToEnd()
    assert.deepEqual(/** @type {any} */ (reply.body).risk, { by: 'fraud check' })
  })

  it('scopes a run to exactly the components a first trace run touched', async () => {
    const { core, ids, at } = payments()
    const first = sim.createRun({ seed: 1, ...sim.planRun(core, { behaviours }) })
    const [traced] = authorise(first, ids.payments)
    await first.runToEnd()
    const scope = sim.requestPath(first.spans)
    const touched = [
      at.payments,
      at.service,
      at.fraud,
      at.auth,
      at.tokenService,
      at.ledger,
      at.ledgerApi,
    ].sort()
    assert.deepEqual(scope, { kind: 'selection', nodes: touched })
    const plan = sim.planRun(core, { behaviours, scope })
    assert.deepEqual(
      plan.nodes
        .map(n => n.id)
        .filter(id => !id.startsWith('stub:'))
        .sort(),
      touched
    )
    const again = sim.createRun({ seed: 1, ...plan })
    const [reply] = authorise(again, ids.payments)
    await again.runToEnd()
    assert.deepEqual(reply.body, traced.body)
  })

  it('replays traffic recorded at an edge entering the scope at its original times', async () => {
    const { core, ids, at } = payments()
    const wide = sim.createRun({ seed: 1, record: true, ...sim.planRun(core, { behaviours }) })
    authorise(wide, ids.payments, [0, 1000])
    await wide.runToEnd()
    const arrivals = wide.spans
      .filter(s => s.node === at.fraud && s.kind === 'public')
      .map(s => s.startUs)
    const plan = sim.planRun(core, { behaviours, scope: { kind: 'selection', nodes: [at.fraud] } })
    const narrow = sim.createRun({ seed: 1, ...plan })
    const replies = sim.replayInbound(narrow, plan.inbound, wide.recordings)
    await narrow.runToEnd()
    assert.deepEqual(
      narrow.spans.filter(s => s.node === at.fraud && s.kind === 'public').map(s => s.startUs),
      arrivals
    )
    assert.deepEqual(
      replies.map(r => r.body),
      [{ by: 'fraud check' }, { by: 'fraud check' }]
    )
  })
})
