// @ts-check
// Black-box and expanded composites (task 0406, spec §6 "Black box or expanded", §7 "Black-box
// models for composites"): each composite runs in the mode a run chooses. Expanded, each public
// method goes through its binding into the inner system; as a black box, the component's own
// behaviour answers, or a System's contract.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCore, createPrng, createRegistry } from '../../core/src/index.js'
import {
  buildRecursivePayments,
  registerFixtureTypes,
} from '../../../tools/fixtures/recursive-payments.js'
import * as sim from '../src/index.js'

const MS = 1000

/**
 * A core with a seeded id stream and a fixed clock.
 * @param {import('../../core/src/index.js').Registry} registry
 */
function coreWith(registry) {
  const prng = createPrng(1)
  return createCore({
    clock: () => Date.UTC(2026, 8, 30),
    random: n => prng.bytes(n),
    registry,
    actorId: 'tester',
  })
}

/** The recursive payments fixture (eng §9), built through commands. */
function payments() {
  const registry = createRegistry()
  registerFixtureTypes(registry)
  const core = coreWith(registry)
  const ids = buildRecursivePayments(core)
  // A run names each component by its path of node ids from the root.
  const at = {
    payments: ids.payments,
    service: `${ids.payments}/${ids.service}`,
    ledger: `${ids.payments}/${ids.ledger}`,
    ledgerApi: `${ids.payments}/${ids.ledger}/${ids.ledgerApi}`,
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

/**
 * Asks Payments to authorise, in a run of the model with the given modes.
 * @param {any} core @param {string} payments @param {Record<string, 'expanded'|'blackbox'>} [modes]
 */
async function authorise(core, payments, modes = {}) {
  const run = sim.createRun({ seed: 1, ...sim.planRun(core, { modes, behaviours }) })
  const reply = run.inject({
    node: payments,
    port: 'in',
    method: 'authorise',
    body: { amount: 10 },
  })
  await run.runToEnd()
  return { run, reply: /** @type {any} */ (reply) }
}

/** The public-method spans of a run: node, method and status. @param {any} run */
const handled = run =>
  run.spans
    .filter((/** @type {any} */ s) => s.kind === 'public')
    .map((/** @type {any} */ s) => [s.node, s.method, s.status])

/**
 * Front → Hop → Echo, with Hop extracted into a System, Relay, so Hop's calls to Echo leave
 * through Relay's out port. Built through commands.
 */
function relayModel() {
  const registry = createRegistry()
  const type = (/** @type {string} */ id, /** @type {string[]} */ methods, out = true) => ({
    id,
    name: id,
    version: '1.0.0',
    extends: 'base:service',
    ports: [
      { name: 'in', direction: 'in', exposes: methods },
      ...(out ? [{ name: 'out', direction: 'out' }] : []),
    ],
    methods: { public: Object.fromEntries(methods.map(m => [m, {}])) },
  })
  registry.register(type('test.front', ['go']))
  registry.register(type('test.hop', ['go']))
  registry.register(type('test.echo', ['echo'], false))
  const core = coreWith(registry)
  const root = core.dispatch({ type: 'project.init', payload: { name: 'Relay' } }).rootSystemId
  const add = (/** @type {string} */ typeRef) =>
    core.dispatch({ type: 'component.add', payload: { systemId: root, typeRef } })
  const [front, hop, echo] = ['test.front', 'test.hop', 'test.echo'].map(add)
  const portOf = (/** @type {string} */ node, /** @type {string} */ name) =>
    core.portsOf(node).find(p => p.name === name)?.id
  for (const [from, to, method] of [
    [front, hop, 'go'],
    [hop, echo, 'echo'],
  ])
    core.dispatch({
      type: 'edge.add',
      payload: { fromPort: portOf(from, 'out'), toPort: portOf(to, 'in'), method },
    })
  const relay = core.dispatch({
    type: 'system.extract',
    payload: { systemId: root, nodeIds: [hop], name: 'Relay' },
  }).nodeId
  return { core, front, hop, echo, relay }
}

describe('composites', () => {
  it('answers the same request through the recursive fixture with each composite in either mode', async () => {
    const { core, ids, at } = payments()
    const composites = /** @type {const} */ (['payments', 'ledger', 'fraud', 'auth'])
    for (let mask = 0; mask < 2 ** composites.length; mask++) {
      /** @type {Record<string, 'expanded'|'blackbox'>} */
      const modes = {}
      for (const [i, name] of composites.entries())
        modes[at[name]] = mask & (1 << i) ? 'blackbox' : 'expanded'
      const label = composites.map(name => `${name} ${modes[at[name]]}`).join(', ')
      const { reply } = await authorise(core, ids.payments, modes)
      assert.equal(reply.status, 'ok', label)
      if (modes[at.payments] === 'blackbox') {
        assert.equal(reply.body, null, `${label}: Payments answers from its contract`)
        continue
      }
      const expanded = (/** @type {string} */ name) => modes[at[name]] === 'expanded'
      assert.deepEqual(
        reply.body,
        {
          risk: { by: expanded('fraud') ? 'rules engine' : 'fraud check' },
          token: expanded('auth') ? { valid: true } : null,
          entry: expanded('ledger') ? { recorded: true } : null,
        },
        label
      )
    }
  })

  it('records spans inside the inner system when expanded, and one span for a black box', async () => {
    const { core, ids, at } = payments()
    // By default Systems run expanded, and a component opened as a system runs as a black box.
    const byDefault = await authorise(core, ids.payments)
    assert.deepEqual(handled(byDefault.run), [
      [at.service, 'authorise', 'ok'],
      [at.fraud, 'score', 'ok'],
      [at.tokenService, 'verify', 'ok'],
      [at.ledgerApi, 'record', 'ok'],
    ])
    const fraudExpanded = await authorise(core, ids.payments, { [at.fraud]: 'expanded' })
    assert.deepEqual(handled(fraudExpanded.run)[1], [at.rules, 'score', 'ok'])
    const blackBox = await authorise(core, ids.payments, { [at.payments]: 'blackbox' })
    assert.deepEqual(handled(blackBox.run), [[ids.payments, 'authorise', 'ok']])
    assert.equal(blackBox.run.spans.length, 1, 'nothing inside Payments ran')
  })

  it('fails a call to an unbound method in expanded mode with E_METHOD_UNBOUND', async () => {
    const { core, ids, at } = payments()
    const fraudIn = core.portsOf(ids.fraud).find(p => p.name === 'in')?.boundaryPortId
    core.dispatch({
      type: 'boundary.unbind',
      payload: { boundaryPortId: fraudIn, method: 'score' },
    })
    const expanded = await authorise(core, ids.payments, { [at.fraud]: 'expanded' })
    assert.equal(expanded.reply.error?.code, 'E_METHOD_UNBOUND')
    const fraud = expanded.run.spans.find(s => s.node === at.fraud)
    assert.deepEqual([fraud?.status, fraud?.code], ['error', 'E_METHOD_UNBOUND'])
    assert.match(String(expanded.reply.error?.message), /score/)
    const blackBox = await authorise(core, ids.payments, { [at.fraud]: 'blackbox' })
    assert.equal(blackBox.reply.status, 'ok', 'as a black box its own behaviour answers')
  })

  it('answers as a black-box System from its contract: after its service time, with no body', async () => {
    const { core, ids, at } = payments()
    core.dispatch({
      type: 'system.update',
      payload: { id: ids.ledgerSystem, changes: { contract: { 'serviceTime.p99': { max: 30 } } } },
    })
    const { run, reply } = await authorise(core, ids.payments, { [at.ledger]: 'blackbox' })
    const ledger = run.spans.find(s => s.node === at.ledger)
    assert.deepEqual(
      [ledger?.status, Number(ledger?.endUs) - Number(ledger?.startUs)],
      ['ok', 30 * MS]
    )
    assert.equal(reply.body.entry, null)
  })

  it('sends a message from inside an expanded composite out through its boundary port', async () => {
    const { core, front, hop, echo, relay } = relayModel()
    const pass = (/** @type {string} */ method) => ({
      public: {
        go: (/** @type {any} */ m, /** @type {any} */ ctx) => ctx.send('out', method, m.body),
      },
    })
    const run = sim.createRun({
      seed: 1,
      ...sim.planRun(core, {
        behaviours: {
          'test.front': pass('go'),
          'test.hop': pass('echo'),
          'test.echo': { public: { echo: (/** @type {any} */ m) => `echo: ${m.body}` } },
        },
      }),
    })
    const reply = run.inject({ node: front, port: 'in', method: 'go', body: 'hi' })
    await run.runToEnd()
    assert.equal(reply.body, 'echo: hi')
    assert.deepEqual(handled(run), [
      [front, 'go', 'ok'],
      [`${relay}/${hop}`, 'go', 'ok'],
      [echo, 'echo', 'ok'],
    ])
  })
})
