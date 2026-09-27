import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/index.js'
import { fixtures } from '../../../tools/testing/index.js'
import { add, connect, createTestCore, port, setup, testRegistry } from './helpers.js'

const fixture = fixtures(import.meta.url)

/** An API whose `in` port exposes two public methods, and a worker that exposes one. */
const API = {
  id: 'test.api',
  name: 'Test API',
  version: '1.0.0',
  extends: 'base:service',
  ports: [
    { name: 'in', direction: 'in', accepts: ['http'], exposes: ['checkout', 'refund'] },
    { name: 'out', direction: 'out', accepts: ['http'] },
  ],
  methods: { public: { checkout: {}, refund: {} }, private: { audit: {} } },
}
const WORKER = {
  id: 'test.worker',
  name: 'Test Worker',
  version: '1.0.0',
  extends: 'base:service',
  ports: [{ name: 'in', direction: 'in', accepts: ['http'], exposes: ['record'] }],
  methods: { public: { record: {} } },
}

function bindingRegistry() {
  const registry = testRegistry()
  registry.register(API)
  registry.register(WORKER)
  return registry
}

/** @param {import('../src/index.js').Core} c @param {string} nodeId @param {string} name */
const boundaryOf = (c, nodeId, name) =>
  /** @type {string} */ (c.portsOf(nodeId).find(p => p.name === name)?.boundaryPortId)

/**
 * Opens `nodeId` as a system and maps its `in` boundary port to `inside`'s `in` port.
 * @param {import('../src/index.js').Core} c @param {string} nodeId @param {string} inside
 */
function mapIn(c, nodeId, inside) {
  const bp = boundaryOf(c, nodeId, 'in')
  c.dispatch({
    type: 'boundary.update',
    payload: { id: bp, changes: { internalPortId: port(c, inside, 'in') } },
  })
  return bp
}

/**
 * A Shop API opened as a system: Orders behind its `in` port calls Ledger, and Audit stands
 * apart, connected to nothing.
 */
function shop() {
  const { core: c, root } = setup({ registry: bindingRegistry() })
  const shopId = add(c, root, 'test.api', 'Shop')
  const inner = c.dispatch({ type: 'component.openAsSystem', payload: { id: shopId } })
  const orders = add(c, inner, 'test.api', 'Orders')
  const ledger = add(c, inner, 'test.worker', 'Ledger')
  const audit = add(c, inner, 'test.worker', 'Audit')
  const edge = connect(c, orders, 'out', ledger, 'in')
  const bp = mapIn(c, shopId, orders)
  /** @param {string} method @param {string} nodeId @param {string} target */
  const bind = (method, nodeId, target) =>
    c.tryDispatch({
      type: 'boundary.bind',
      payload: { boundaryPortId: bp, method, nodeId, target },
    })
  return { core: c, root, shop: shopId, inner, orders, ledger, audit, edge, bp, bind }
}

/** @param {import('../src/index.js').Core} c */
const unbound = c =>
  c
    .problems()
    .filter(p => p.code === 'E_METHOD_UNBOUND')
    .map(p => [c.node(p.id).name, /'(\w+)'/.exec(p.message)?.[1]])

describe('method bindings', () => {
  it('binding to a component not reachable from the matching boundary port fails', () => {
    const { core: c, root, orders, ledger, audit, bp, bind } = shop()
    assert.equal(bind('checkout', audit, 'record').code, 'E_METHOD_UNREACHABLE')
    assert.equal(bind('checkout', ledger, 'record').ok, true, 'Ledger is downstream of Orders')
    assert.equal(bind('refund', orders, 'checkout').ok, true, 'Orders is behind the port')
    assert.equal(bind('checkout', ledger, 'nope').code, 'E_METHOD_UNKNOWN')
    assert.equal(
      bind('audit', ledger, 'record').code,
      'E_METHOD_NOT_EXPOSED',
      'only methods the owner port exposes can be bound'
    )
    assert.deepEqual(c.boundaryPort(bp).bindings, {
      checkout: { nodeId: ledger, method: 'record' },
      refund: { nodeId: orders, method: 'checkout' },
    })
    c.dispatch({ type: 'boundary.unbind', payload: { boundaryPortId: bp, method: 'refund' } })
    assert.deepEqual(Object.keys(c.boundaryPort(bp).bindings), ['checkout'])
    c.undo()
    assert.deepEqual(Object.keys(c.boundaryPort(bp).bindings), ['checkout', 'refund'])

    // A System component declares its public methods by binding them.
    const billing = c.dispatch({ type: 'system.create', payload: { name: 'Billing' } })
    const biller = add(c, billing, 'test.worker', 'Biller')
    const billingIn = c.dispatch({
      type: 'boundary.add',
      payload: {
        systemId: billing,
        name: 'in',
        direction: 'in',
        internalPortId: port(c, biller, 'in'),
      },
    })
    const placed = c.dispatch({
      type: 'node.place',
      payload: { systemId: root, systemRef: billing },
    })
    c.dispatch({
      type: 'boundary.bind',
      payload: { boundaryPortId: billingIn, method: 'charge', nodeId: biller, target: 'record' },
    })
    assert.equal(c.resolveBinding(placed, 'charge').nodeId, biller)
    const copy = c.dispatch({
      type: 'node.place',
      payload: { systemId: root, systemRef: billing, placement: 'value' },
    })
    const copied = c.resolveBinding(copy, 'charge').nodeId
    assert.equal(c.node(copied).name, 'Biller')
    assert.equal(
      c.node(copied).systemId,
      c.node(copy).innerSystemRef,
      'a copy binds to its own copies'
    )
  })

  it('an unbound public method appears in problems()', () => {
    const { core: c, ledger, orders, edge, bp, bind } = shop()
    assert.deepEqual(unbound(c), [
      ['Shop', 'checkout'],
      ['Shop', 'refund'],
    ])
    bind('checkout', ledger, 'record')
    bind('refund', orders, 'checkout')
    assert.deepEqual(unbound(c), [], 'Orders has no inner system, so nothing of its is unbound')

    c.dispatch({ type: 'edge.remove', payload: { id: edge } })
    const unreachable = c.problems().filter(p => p.code === 'E_METHOD_UNREACHABLE')
    assert.equal(unreachable.length, 1, 'Ledger is no longer reachable')
    assert.match(unreachable[0].message, /checkout/)
    c.undo()

    c.dispatch({ type: 'node.remove', payload: { id: ledger } })
    assert.equal(c.boundaryPort(bp).bindings.checkout, undefined, 'removed with its target')
    assert.deepEqual(unbound(c), [['Shop', 'checkout']])
    c.undo()
    assert.deepEqual(c.boundaryPort(bp).bindings.checkout, { nodeId: ledger, method: 'record' })
  })

  it('resolveBinding follows bindings through three levels to the implementing component', () => {
    const { core: c, shop: shopId, orders, bind } = shop()
    const inner = c.dispatch({ type: 'component.openAsSystem', payload: { id: orders } })
    const worker = add(c, inner, 'test.worker', 'Journal')
    const ordersIn = mapIn(c, orders, worker)
    bind('checkout', orders, 'checkout')
    c.dispatch({
      type: 'boundary.bind',
      payload: { boundaryPortId: ordersIn, method: 'checkout', nodeId: worker, target: 'record' },
    })
    assert.deepEqual(c.resolveBinding(shopId, 'checkout'), {
      nodeId: worker,
      method: 'record',
      path: [
        { nodeId: shopId, method: 'checkout' },
        { nodeId: orders, method: 'checkout' },
        { nodeId: worker, method: 'record' },
      ],
    })
    assert.deepEqual(
      c.resolveBinding(worker, 'record'),
      { nodeId: worker, method: 'record', path: [{ nodeId: worker, method: 'record' }] },
      'a component without an inner system implements its own methods'
    )
    assert.throws(
      () => c.resolveBinding(shopId, 'refund'),
      err => err.code === 'E_METHOD_UNBOUND'
    )
    bind('refund', orders, 'refund')
    assert.throws(
      () => c.resolveBinding(shopId, 'refund'),
      err => err.code === 'E_METHOD_UNBOUND' && /Orders/.test(err.message),
      'unbound one level down'
    )
  })

  it('a manifest declares public and private methods, and its ports expose only public ones', () => {
    const registry = testRegistry()
    const refused = (/** @type {any} */ changes) => {
      try {
        registry.register({ ...WORKER, id: 'test.bad', ...changes })
      } catch (err) {
        return /** @type {any} */ (err).code === 'INVALID' ? err.message : 'wrong code'
      }
      return 'accepted'
    }
    assert.match(
      refused({ ports: [{ name: 'in', direction: 'in', exposes: ['nope'] }] }),
      /exposes 'nope', which is not a public method/
    )
    assert.match(
      refused({ methods: { public: { a: {} }, private: { a: {} } } }),
      /'a' is both public and private/
    )
    assert.match(refused({ methods: { public: ['a'] } }), /methods.public must be an object/)
    assert.equal(refused({}), 'accepted')
  })

  it('a schema-version-3 snapshot migrates to version 4, and its op log replays to the same state hash', () => {
    const v3 = fixture('schema-v3/bindings')
    assert.equal(v3.schemaVersion, 3)
    const migrated = core.migrateSnapshot(v3, { registry: testRegistry() })
    assert.equal(migrated.schemaVersion, 4)
    assert.equal(migrated.project.schemaVersion, 4)
    assert.ok(migrated.boundaryPorts.length > 0)
    for (const bp of migrated.boundaryPorts) assert.deepEqual(bp.bindings, {}, bp.name)
    assert.deepEqual(v3, fixture('schema-v3/bindings'), 'the migration does not change its input')

    const opened = createTestCore({ snapshot: v3 })
    const replayed = createTestCore()
    replayed.replay(fixture('schema-v3/bindings-oplog'))
    assert.equal(replayed.stateHash(), opened.stateHash())
  })
})
