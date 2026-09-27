import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRandom, gen, property } from '../../../tools/testing/index.js'
import { add, bindingRegistry, connect, modelState, port, setup } from './helpers.js'

/** @typedef {import('../src/index.js').Core} Core */

/** @param {Core} c @param {string} systemId @param {string[]} nodeIds @param {string} [name] */
const extract = (c, systemId, nodeIds, name = 'Core') =>
  c.dispatch({ type: 'system.extract', payload: { systemId, nodeIds, name } })

/** @param {Core} c @param {string} systemId */
const boundary = (c, systemId) =>
  c
    .boundaryPortsOf(systemId)
    .map(bp => `${bp.name}:${bp.direction}`)
    .sort()

/** Where each edge of a system runs, with the method it calls. @param {Core} c @param {string} systemId */
const wiring = (c, systemId) =>
  c
    .edgesOf(systemId)
    .map(e => {
      const [from, to] = [c.port(e.fromPort), c.port(e.toPort)]
      const method = e.method ? ` (${e.method})` : ''
      return `${c.node(from.nodeId).name}.${from.name} → ${c.node(to.nodeId).name}.${to.name}${method}`
    })
    .sort()

/** Which component and method a public method resolves to, by name. @param {Core} c @param {string} nodeId @param {string} method */
const resolved = (c, nodeId, method) => {
  const r = c.resolveBinding(nodeId, method)
  return [c.node(r.nodeId).name, r.method]
}

/** @param {Core} c */
const methodProblems = c => c.problems().filter(p => p.code.startsWith('E_METHOD'))

describe('edges name the method they call', () => {
  it('an edge names a method its target port exposes, or none', () => {
    const { core: c, root } = setup({ registry: bindingRegistry() })
    const client = add(c, root, 'base:client', 'Web client')
    const api = add(c, root, 'test.api', 'API')
    const edge = connect(c, client, 'out', api, 'in', { method: 'checkout' })
    assert.equal(c.edge(edge).method, 'checkout')
    const from = port(c, client, 'out')
    const to = port(c, api, 'in')
    assert.equal(
      c.tryDispatch({ type: 'edge.add', payload: { fromPort: from, toPort: to, method: 'audit' } })
        .code,
      'E_METHOD_NOT_EXPOSED',
      'a private method is never reachable over an edge'
    )
    c.dispatch({ type: 'edge.update', payload: { id: edge, changes: { method: 'refund' } } })
    assert.equal(c.edge(edge).method, 'refund')
    c.dispatch({ type: 'edge.update', payload: { id: edge, changes: { method: null } } })
    assert.equal(c.edge(edge).method, null)
    assert.equal(
      c.tryDispatch({ type: 'edge.update', payload: { id: edge, changes: { method: 'nope' } } })
        .code,
      'E_METHOD_NOT_EXPOSED'
    )

    const orders = add(c, root, 'test.service', 'Orders')
    c.dispatch({ type: 'edge.rewire', payload: { id: edge, toPort: port(c, orders, 'in') } })
    assert.deepEqual(methodProblems(c), [], 'an edge that names no method goes anywhere')
    c.undo()
    c.dispatch({ type: 'edge.update', payload: { id: edge, changes: { method: 'checkout' } } })
    c.dispatch({ type: 'edge.rewire', payload: { id: edge, toPort: port(c, orders, 'in') } })
    assert.deepEqual(
      methodProblems(c).map(p => [p.code, p.id]),
      [['E_METHOD_NOT_EXPOSED', edge]],
      'rewiring keeps the method, and problems() says the new port does not expose it'
    )
  })
})

describe('primitive commands for compound operations', () => {
  it('node.move moves components with the edges among them, and refuses to leave an edge crossing levels', () => {
    const { core: c, root } = setup()
    const a = add(c, root, 'test.service', 'A')
    const b = add(c, root, 'test.service', 'B')
    const d = add(c, root, 'test.db', 'D')
    const ab = connect(c, a, 'out', b, 'in')
    connect(c, b, 'db', d, 'in')
    const lib = c.dispatch({ type: 'system.create', payload: { name: 'Lib' } })
    const before = modelState(c)
    assert.equal(
      c.tryDispatch({ type: 'node.move', payload: { ids: [a, b], systemId: lib } }).code,
      'E_EDGE_CROSS_LEVEL',
      'B → D would cross levels'
    )
    c.dispatch({ type: 'node.move', payload: { ids: [a, b, d], systemId: lib } })
    assert.deepEqual(
      c
        .nodesOf(lib)
        .map(n => n.name)
        .sort(),
      ['A', 'B', 'D']
    )
    assert.equal(c.edge(ab).systemId, lib, 'the edges among them move too')
    assert.deepEqual(c.nodesOf(root), [])
    c.undo()
    assert.deepEqual(modelState(c), before)

    const placed = c.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: lib } })
    assert.equal(
      c.tryDispatch({ type: 'node.move', payload: { ids: [placed], systemId: lib } }).code,
      'E_SYSTEM_CYCLE'
    )
  })

  it('node.own gives a system that is neither placed nor owned an owning System component', () => {
    const { core: c, root } = setup()
    const lib = c.dispatch({ type: 'system.create', payload: { name: 'Payments' } })
    const bp = c.dispatch({
      type: 'boundary.add',
      payload: { systemId: lib, name: 'in', direction: 'in' },
    })
    const before = modelState(c)
    const own = c.dispatch({ type: 'node.own', payload: { systemId: root, innerSystemRef: lib } })
    const node = c.node(own)
    assert.deepEqual(
      [node.typeRef, node.innerSystemRef, node.placement, node.name],
      ['strata.system@1.0.0', lib, 'value', 'Payments']
    )
    assert.equal(c.system(lib).ownerNodeId, own)
    assert.deepEqual(
      c.portsOf(own).map(p => [p.name, p.boundaryPortId]),
      [['in', bp]]
    )
    assert.equal(
      c.tryDispatch({ type: 'node.own', payload: { systemId: root, innerSystemRef: lib } }).code,
      'INVALID',
      'a system has at most one owner'
    )
    assert.equal(
      c.tryDispatch({ type: 'node.own', payload: { systemId: lib, innerSystemRef: root } }).code,
      'INVALID',
      'the root system is never owned'
    )
    c.undo()
    assert.deepEqual(modelState(c), before)
  })
})

describe('extract as system and inline system', () => {
  it('extracting two components with three crossing edges creates a System with three boundary ports and rewired external edges', () => {
    const { core: c, root } = setup()
    const client = add(c, root, 'base:client', 'Web client')
    const orders = add(c, root, 'test.service', 'Orders')
    const billing = add(c, root, 'test.service', 'Billing')
    const db = add(c, root, 'test.db', 'Orders DB')
    const ledger = add(c, root, 'test.db', 'Ledger')
    connect(c, client, 'out', orders, 'in')
    connect(c, orders, 'out', billing, 'in')
    connect(c, orders, 'db', db, 'in')
    connect(c, billing, 'db', ledger, 'in')
    const { systemId, nodeId } = extract(c, root, [orders, billing], 'Orders system')
    assert.equal(c.node(nodeId).typeRef, 'strata.system@1.0.0')
    assert.equal(c.system(systemId).ownerNodeId, nodeId)
    assert.deepEqual(boundary(c, systemId), ['Billing.db:out', 'db:out', 'in:in'])
    assert.deepEqual(wiring(c, root), [
      'Orders system.Billing.db → Ledger.in',
      'Orders system.db → Orders DB.in',
      'Web client.out → Orders system.in',
    ])
    assert.deepEqual(wiring(c, systemId), ['Orders.out → Billing.in'])
  })

  it('methods called across the crossing edges become bound public methods of the new System', () => {
    const { core: c, root } = setup({ registry: bindingRegistry() })
    const web = add(c, root, 'base:client', 'Web client')
    const admin = add(c, root, 'base:client', 'Admin')
    const api = add(c, root, 'test.api', 'Checkout API')
    const orders = add(c, root, 'test.service', 'Orders')
    const db = add(c, root, 'test.db', 'Orders DB')
    connect(c, web, 'out', api, 'in', { method: 'checkout' })
    connect(c, admin, 'out', orders, 'in')
    connect(c, api, 'out', orders, 'in')
    connect(c, orders, 'db', db, 'in')
    const { nodeId: system } = extract(c, root, [api, orders], 'Checkout')
    assert.deepEqual(resolved(c, system, 'checkout'), ['Checkout API', 'checkout'])
    assert.deepEqual(
      resolved(c, system, 'handle'),
      ['Orders', 'handle'],
      'an edge that names no method may call any method its port exposes'
    )
    assert.throws(
      () => c.resolveBinding(system, 'refund'),
      err => err.code === 'E_METHOD_UNKNOWN',
      'nothing outside calls refund'
    )
    assert.deepEqual(methodProblems(c), [])
    assert.deepEqual(wiring(c, root), [
      'Admin.out → Checkout.Orders.in',
      'Checkout.db → Orders DB.in',
      'Web client.out → Checkout.in (checkout)',
    ])
    const toSystem = c.portsOf(system).find(p => p.name === 'in')?.id
    assert.equal(
      c.tryDispatch({
        type: 'edge.add',
        payload: { fromPort: port(c, admin, 'out'), toPort: toSystem, method: 'refund' },
      }).code,
      'E_METHOD_NOT_EXPOSED',
      'the System exposes only what it binds'
    )
  })

  it('bindings of the enclosing system follow the components that extract moves, and inline puts them back', () => {
    const { core: c, root } = setup({ registry: bindingRegistry() })
    const shop = add(c, root, 'test.api', 'Shop')
    const inner = c.dispatch({ type: 'component.openAsSystem', payload: { id: shop } })
    const orders = add(c, inner, 'test.api', 'Orders')
    const ledger = add(c, inner, 'test.worker', 'Ledger')
    connect(c, orders, 'out', ledger, 'in')
    const bp = /** @type {string} */ (c.portsOf(shop).find(p => p.name === 'in')?.boundaryPortId)
    c.dispatch({
      type: 'boundary.update',
      payload: { id: bp, changes: { internalPortId: port(c, orders, 'in') } },
    })
    const bind = (/** @type {string} */ method, /** @type {string} */ nodeId, target = method) =>
      c.dispatch({
        type: 'boundary.bind',
        payload: { boundaryPortId: bp, method, nodeId, target },
      })
    bind('checkout', orders)
    bind('refund', ledger, 'record')
    const before = modelState(c)

    const { nodeId: system } = extract(c, inner, [orders, ledger], 'Core')
    assert.deepEqual(resolved(c, shop, 'checkout'), ['Orders', 'checkout'])
    assert.deepEqual(resolved(c, shop, 'refund'), ['Ledger', 'record'])
    assert.equal(c.resolveBinding(shop, 'refund').path.length, 3, 'through the new System')
    assert.deepEqual(methodProblems(c), [])

    c.dispatch({ type: 'system.inline', payload: { nodeId: system } })
    assert.deepEqual(modelState(c), before)
  })

  it('property: inline(extract(x)) equals x on random graphs', () => {
    const TYPES = ['base:client', 'test.api', 'test.service', 'test.db', 'test.worker']
    const METHODS = [null, 'checkout', 'refund', 'handle', 'record']
    property(
      [gen.int(0, 2 ** 31 - 1), gen.array(gen.int(0, 2 ** 31 - 1), { min: 1, max: 12 })],
      (seed, steps) => {
        const { core: c, root } = setup({ registry: bindingRegistry() })
        const random = createRandom(seed)
        const nodes = [0, 1, 2, 3, 4].map(i =>
          add(c, root, TYPES[random.uint32() % TYPES.length], `N${i}`)
        )
        const ports = nodes.flatMap(id => c.portsOf(id))
        for (const step of steps) {
          const r = createRandom(step)
          const outs = ports.filter(p => p.direction !== 'in')
          const ins = ports.filter(p => p.direction !== 'out')
          const from = outs[r.uint32() % outs.length]
          const to = ins[r.uint32() % ins.length]
          const method = METHODS[r.uint32() % METHODS.length]
          const payload = { fromPort: from.id, toPort: to.id, method }
          if (!c.tryDispatch({ type: 'edge.add', payload }).ok)
            c.tryDispatch({ type: 'edge.add', payload: { ...payload, method: null } })
        }
        let selection = nodes.filter(() => random.uint32() % 2)
        if (!selection.length) selection = [nodes[0]]
        const before = modelState(c)
        const { nodeId } = extract(c, root, selection)
        assert.deepEqual(methodProblems(c), [], 'extract leaves every method bound and reachable')
        c.dispatch({ type: 'system.inline', payload: { nodeId } })
        assert.deepEqual(modelState(c), before)
      },
      { runs: 100 }
    )
  })

  it('extract is a single undo step', () => {
    const { core: c, root } = setup({ registry: bindingRegistry() })
    const web = add(c, root, 'base:client', 'Web client')
    const api = add(c, root, 'test.api', 'API')
    const orders = add(c, root, 'test.service', 'Orders')
    connect(c, web, 'out', api, 'in', { method: 'checkout' })
    connect(c, api, 'out', orders, 'in')
    const before = modelState(c)
    const count = c.oplog.length
    const { systemId } = extract(c, root, [api, orders])
    assert.equal(c.oplog.length, count + 1, 'one operation')
    assert.equal(c.oplog.at(-1)?.command, 'system.extract')
    const after = modelState(c)
    c.undo()
    assert.deepEqual(modelState(c), before)
    c.redo()
    assert.deepEqual(modelState(c), after)
    assert.equal(c.system(systemId)?.name, 'Core')
  })

  it('the planners are pure and emit primitive commands that do what the compound command does', () => {
    const { core: c, root } = setup({ registry: bindingRegistry() })
    const web = add(c, root, 'base:client', 'Web client')
    const api = add(c, root, 'test.api', 'API')
    const orders = add(c, root, 'test.service', 'Orders')
    connect(c, web, 'out', api, 'in', { method: 'checkout' })
    connect(c, api, 'out', orders, 'in')
    const before = c.snapshot()
    const payload = { systemId: root, nodeIds: [api, orders], name: 'Core' }
    const plan = c.planExtract(payload)
    assert.deepEqual(c.snapshot(), before, 'planning changes nothing')
    const types = new Set(plan.commands.map(command => command.type))
    for (const type of types)
      assert.ok(
        !['system.extract', 'system.inline', 'model.restore'].includes(type),
        `${type} is a primitive command`
      )
    c.dispatch({ type: 'batch', payload: { commands: plan.commands } })
    assert.equal(c.node(plan.nodeId).innerSystemRef, plan.systemId)
    assert.deepEqual(wiring(c, root), ['Web client.out → Core.in (checkout)'])
    assert.deepEqual(resolved(c, plan.nodeId, 'checkout'), ['API', 'checkout'])

    const inline = c.planInline({ nodeId: plan.nodeId })
    c.dispatch({ type: 'batch', payload: { commands: inline.commands } })
    assert.deepEqual(wiring(c, root), ['API.out → Orders.in', 'Web client.out → API.in (checkout)'])
  })
})
