import { describe, it, test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, add, port, connect, buildPayments, modelState } from './helpers.js'

/** Edge endpoints as readable "Node.port → Node.port" strings. */
function wiring(core, systemId) {
  const label = portId => {
    const p = core.port(portId)
    return `${core.node(p.nodeId).name}.${p.name}`
  }
  return core
    .edgesOf(systemId)
    .map(e => `${label(e.fromPort)} → ${label(e.toPort)}`)
    .sort()
}

function extractPayments(core, root, m) {
  return core.dispatch({
    type: 'system.extract',
    payload: {
      systemId: root,
      nodeIds: [m.gateway, m.service, m.ledger, m.queue],
      name: 'Payments System',
    },
  })
}

test('extract as system reproduces the payments example from the spec', () => {
  const { core, root } = setup()
  const m = buildPayments(core, root)
  const [view] = core.viewsOf(root)
  const positions = {
    [m.client]: [0, 100],
    [m.gateway]: [200, 100],
    [m.service]: [400, 100],
    [m.ledger]: [600, 50],
    [m.queue]: [600, 150],
    [m.bank]: [800, 150],
  }
  core.dispatch({
    type: 'view.layout',
    payload: {
      viewId: view.id,
      set: Object.fromEntries(Object.entries(positions).map(([id, [x, y]]) => [id, { x, y }])),
    },
  })
  const opsBefore = core.oplog.length

  const { systemId, nodeId } = extractPayments(core, root, m)
  assert.equal(core.oplog.length, opsBefore + 1, 'extract is one undoable command')

  const child = core.system(systemId)
  assert.equal(child.name, 'Payments System')
  assert.equal(child.levelTag, 'container')
  assert.equal(child.ownerNodeId, nodeId)
  const composite = core.node(nodeId)
  assert.deepEqual(
    [composite.kind, composite.placement, composite.systemRef],
    ['composite', 'value', systemId]
  )

  assert.deepEqual(
    core.nodesOf(root).map(n => n.name),
    ['Web client', 'Bank API', 'Payments System']
  )
  assert.deepEqual(
    core
      .nodesOf(systemId)
      .map(n => n.name)
      .sort(),
    ['Gateway', 'Ledger DB', 'Payment service', 'Settlement queue']
  )

  // The parent sees one node with an in and an out port...
  assert.deepEqual(
    core.portsOf(nodeId).map(p => [p.name, p.direction]),
    [
      ['in', 'in'],
      ['out', 'out'],
    ]
  )
  assert.deepEqual(wiring(core, root), [
    'Payments System.out → Bank API.events',
    'Web client.out → Payments System.in',
  ])
  // ...which inside are boundary ports mapped to the gateway input and the queue output.
  assert.deepEqual(
    core.boundaryPortsOf(systemId).map(bp => [bp.name, bp.direction, bp.internalPortId]),
    [
      ['in', 'in', port(core, m.gateway, 'in')],
      ['out', 'out', port(core, m.queue, 'out')],
    ]
  )
  assert.deepEqual(wiring(core, systemId), [
    'Gateway.out → Payment service.in',
    'Payment service.db → Ledger DB.in',
    'Payment service.publish → Settlement queue.in',
  ])

  // Views: the composite sits where the selection was; the child keeps the positions.
  assert.deepEqual(core.view(view.id).layout[nodeId], { x: 450, y: 100 })
  assert.equal(core.view(view.id).layout[m.gateway], undefined)
  const [childView] = core.viewsOf(systemId)
  assert.deepEqual(childView.layout[m.ledger], { x: 600, y: 50 })

  assert.deepEqual(core.problems(), [])
})

test('extract undoes and redoes exactly', () => {
  const { core, root } = setup()
  const m = buildPayments(core, root)
  const before = modelState(core)
  extractPayments(core, root, m)
  const after = modelState(core)
  core.undo()
  assert.deepEqual(modelState(core), before)
  core.redo()
  assert.deepEqual(modelState(core), after)
})

test('extract shares one boundary port per internal port and names clashes clearly', () => {
  const { core, root } = setup()
  const c1 = add(core, root, 'base:client', 'Mobile')
  const c2 = add(core, root, 'base:client', 'Web')
  const a = add(core, root, 'base:service', 'A')
  const b = add(core, root, 'base:service', 'B')
  connect(core, c1, 'out', a, 'in')
  connect(core, c2, 'out', a, 'in')
  connect(core, c2, 'out', b, 'in')
  const { systemId, nodeId } = core.dispatch({
    type: 'system.extract',
    payload: { systemId: root, nodeIds: [a, b] },
  })
  assert.deepEqual(
    core.boundaryPortsOf(systemId).map(bp => bp.name),
    ['in', 'B.in']
  )
  assert.equal(core.node(nodeId).name, 'New system')
  assert.deepEqual(wiring(core, root), [
    'Mobile.out → New system.in',
    'Web.out → New system.B.in',
    'Web.out → New system.in',
  ])
})

test("extract keeps the parent's own boundary ports working", () => {
  const { core, root } = setup()
  const lib = core.dispatch({ type: 'system.create', payload: { name: 'Orders' } })
  const svc = add(core, lib, 'base:service', 'Svc')
  const db = add(core, lib, 'base:store', 'DB')
  connect(core, svc, 'out', db, 'in')
  core.dispatch({
    type: 'boundary.add',
    payload: { systemId: lib, name: 'api', direction: 'in', internalPortId: port(core, svc, 'in') },
  })
  const user = core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: lib } })
  const { nodeId } = core.dispatch({
    type: 'system.extract',
    payload: { systemId: lib, nodeIds: [svc], name: 'Core' },
  })
  const api = core.boundaryPortsOf(lib)[0]
  assert.equal(
    core.port(api.internalPortId).nodeId,
    nodeId,
    'the outer boundary port now maps through the new composite'
  )
  const resolved = core.resolvePort(core.portsOf(user)[0].id)
  assert.equal(
    resolved.port.id,
    port(core, svc, 'in'),
    'and still resolves to the service at any depth'
  )
  assert.equal(resolved.boundaryPortIds.length, 2)
})

test('extract rejects bad selections', () => {
  const { core, root } = setup()
  const a = add(core, root, 'base:service', 'A')
  const lib = core.dispatch({ type: 'system.create', payload: { name: 'Lib' } })
  const far = add(core, lib, 'base:service', 'Far')
  assert.throws(
    () => core.dispatch({ type: 'system.extract', payload: { systemId: root, nodeIds: [] } }),
    /at least one node/
  )
  assert.throws(
    () => core.dispatch({ type: 'system.extract', payload: { systemId: root, nodeIds: [a, a] } }),
    /duplicates/
  )
  assert.throws(
    () => core.dispatch({ type: 'system.extract', payload: { systemId: root, nodeIds: [a, far] } }),
    /not in system/
  )
})

test('inline dissolves a composite and reconnects edges through its boundary ports', () => {
  const { core, root } = setup()
  const m = buildPayments(core, root)
  const [view] = core.viewsOf(root)
  core.dispatch({
    type: 'view.layout',
    payload: {
      viewId: view.id,
      set: { [m.gateway]: { x: 100, y: 0 }, [m.service]: { x: 300, y: 0 } },
    },
  })
  const originalWiring = wiring(core, root)
  const originalNodes = core
    .nodesOf(root)
    .map(n => n.id)
    .sort()
  const { systemId, nodeId } = extractPayments(core, root, m)
  core.dispatch({
    type: 'view.layout',
    payload: { viewId: view.id, set: { [nodeId]: { x: 1000, y: 500 } } },
  })

  const ids = core.dispatch({ type: 'system.inline', payload: { nodeId } })
  assert.deepEqual(
    ids.sort(),
    [m.gateway, m.service, m.ledger, m.queue].sort(),
    'by-value inline keeps node ids'
  )
  assert.deepEqual(
    core
      .nodesOf(root)
      .map(n => n.id)
      .sort(),
    originalNodes
  )
  assert.deepEqual(wiring(core, root), originalWiring)
  assert.equal(core.system(systemId), undefined)
  assert.equal(core.node(nodeId), undefined)
  // Positions move with the composite: the selection's centre lands where the composite was.
  assert.deepEqual(core.view(view.id).layout[m.gateway], { x: 900, y: 500 })
  assert.deepEqual(core.view(view.id).layout[m.service], { x: 1100, y: 500 })
  assert.deepEqual(core.problems(), [])
})

test('inlining a by-reference composite copies the library system and leaves it intact', () => {
  const { core, root } = setup()
  const lib = core.dispatch({ type: 'system.create', payload: { name: 'Auth' } })
  const svc = add(core, lib, 'base:service', 'Auth service')
  core.dispatch({
    type: 'boundary.add',
    payload: { systemId: lib, name: 'in', direction: 'in', internalPortId: port(core, svc, 'in') },
  })
  core.dispatch({
    type: 'boundary.add',
    payload: { systemId: lib, name: 'loose', direction: 'out' },
  })
  const placed = core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: lib } })
  const client = add(core, root, 'base:client', 'Client')
  const sink = add(core, root, 'base:store', 'Sink')
  connect(core, client, 'out', placed, 'in')
  connect(core, placed, 'loose', sink, 'in')

  const [copy] = core.dispatch({ type: 'system.inline', payload: { nodeId: placed } })
  assert.notEqual(copy, svc)
  assert.equal(core.node(copy).name, 'Auth service')
  assert.deepEqual(
    wiring(core, root),
    ['Client.out → Auth service.in'],
    'the edge from an unmapped boundary port is dropped'
  )
  assert.ok(core.system(lib))
  assert.deepEqual(
    core.nodesOf(lib).map(n => n.id),
    [svc]
  )
})

test('placements that would make a system contain itself are rejected', () => {
  const { core, root } = setup()
  const a = core.dispatch({ type: 'system.create', payload: { name: 'A' } })
  const b = core.dispatch({ type: 'system.create', payload: { name: 'B' } })
  const c = core.dispatch({ type: 'system.create', payload: { name: 'C' } })
  const place = (systemId, systemRef, placement = 'reference') =>
    core.dispatch({ type: 'node.place', payload: { systemId, systemRef, placement } })
  assert.throws(
    () => place(a, a),
    err => err.code === 'E_SYSTEM_CYCLE'
  )
  place(a, b)
  place(b, c)
  assert.ok(core.containsSystem(a, c))
  assert.throws(
    () => place(b, a),
    err => err.code === 'E_SYSTEM_CYCLE'
  )
  assert.throws(
    () => place(c, a),
    err => err.code === 'E_SYSTEM_CYCLE',
    'transitive cycles too'
  )
  assert.throws(
    () => place(c, a, 'value'),
    err => err.code === 'E_SYSTEM_CYCLE',
    'copies cannot smuggle a cycle in'
  )
  assert.throws(() => place(a, root), /root system cannot be placed/)
  place(root, a)
  assert.ok(core.containsSystem(root, c))
})

test('by value places an independent deep copy; by reference stays linked', () => {
  const { core, root } = setup()
  const inner = core.dispatch({ type: 'system.create', payload: { name: 'Inner' } })
  add(core, inner, 'base:store', 'Store')
  const outer = core.dispatch({ type: 'system.create', payload: { name: 'Outer' } })
  const svc = add(core, outer, 'base:service', 'Svc')
  const owned = core.dispatch({
    type: 'system.extract',
    payload: { systemId: outer, nodeIds: [svc], name: 'Owned' },
  })
  core.dispatch({ type: 'node.place', payload: { systemId: outer, systemRef: inner } })
  core.dispatch({
    type: 'boundary.add',
    payload: {
      systemId: outer,
      name: 'in',
      direction: 'in',
      internalPortId: core.portsOf(owned.nodeId)[0]?.id ?? null,
    },
  })

  const byRef = core.dispatch({
    type: 'node.place',
    payload: { systemId: root, systemRef: outer, placement: 'reference' },
  })
  const byVal = core.dispatch({
    type: 'node.place',
    payload: { systemId: root, systemRef: outer, placement: 'value' },
  })
  assert.equal(core.node(byRef).systemRef, outer)
  const copy = core.node(byVal).systemRef
  assert.notEqual(copy, outer)
  assert.equal(core.system(copy).ownerNodeId, byVal)
  const copyNodes = core.nodesOf(copy)
  assert.deepEqual(
    copyNodes.map(n => n.name),
    core.nodesOf(outer).map(n => n.name)
  )
  const copiedOwned = copyNodes.find(n => n.name === 'Owned')
  assert.notEqual(copiedOwned.systemRef, owned.systemId, 'owned child systems are copied too')
  const copiedRef = copyNodes.find(n => n.name === 'Inner')
  assert.equal(copiedRef.systemRef, inner, 'references inside stay references')
  assert.deepEqual(
    core.portsOf(byVal).map(p => p.name),
    ['in']
  )

  // Editing the source changes the by-reference placement only.
  core.dispatch({
    type: 'boundary.add',
    payload: { systemId: outer, name: 'events', direction: 'out' },
  })
  assert.deepEqual(
    core.portsOf(byRef).map(p => p.name),
    ['in', 'events']
  )
  assert.deepEqual(
    core.portsOf(byVal).map(p => p.name),
    ['in']
  )
  assert.equal(core.pathsTo(inner).length, 2)

  // An owned system cannot be referenced from elsewhere.
  assert.throws(
    () =>
      core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: owned.systemId } }),
    /owned by another composite/
  )
})

test('detach turns a reference into an editable copy without breaking edges', () => {
  const { core, root } = setup()
  const lib = core.dispatch({ type: 'system.create', payload: { name: 'Auth' } })
  const svc = add(core, lib, 'base:service', 'Auth service')
  core.dispatch({
    type: 'boundary.add',
    payload: { systemId: lib, name: 'in', direction: 'in', internalPortId: port(core, svc, 'in') },
  })
  const placed = core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: lib } })
  const client = add(core, root, 'base:client', 'Client')
  const e = connect(core, client, 'out', placed, 'in')
  const copy = core.dispatch({ type: 'node.detach', payload: { id: placed } })
  assert.equal(core.node(placed).placement, 'value')
  assert.equal(core.node(placed).systemRef, copy)
  assert.ok(core.edge(e))
  const target = core.resolvePort(core.edge(e).toPort).port
  assert.notEqual(target.id, port(core, svc, 'in'))
  assert.equal(core.node(target.nodeId).systemId, copy)
  assert.throws(
    () => core.dispatch({ type: 'node.detach', payload: { id: placed } }),
    /not placed by reference/
  )
})

test('removing a by-value composite deletes its whole subtree; undo brings it back', () => {
  const { core, root } = setup()
  const m = buildPayments(core, root)
  const before = modelState(core)
  const { nodeId } = extractPayments(core, root, m)
  const inner = core.dispatch({
    type: 'system.extract',
    payload: { systemId: core.node(nodeId).systemRef, nodeIds: [m.ledger], name: 'Storage' },
  })
  const withTree = modelState(core)
  core.dispatch({ type: 'node.remove', payload: { id: nodeId } })
  assert.equal(core.all('system').length, 1)
  assert.equal(core.node(m.ledger), undefined)
  assert.equal(core.system(inner.systemId), undefined)
  assert.equal(core.all('boundaryPort').length, 0)
  assert.equal(core.all('view').length, 1)
  core.undo()
  assert.deepEqual(modelState(core), withTree)
  core.undo()
  core.undo()
  assert.deepEqual(modelState(core), before)
})

test('recursion depth is unlimited: ten nested levels', () => {
  const { core, root } = setup()
  const leaf = add(core, root, 'test.service', 'Leaf', { props: { serviceTime: 7 } })
  const client = add(core, root, 'base:client', 'Client')
  connect(core, client, 'out', leaf, 'in', { connectionType: 'http' })
  let system = root
  let target = leaf
  const composites = []
  for (let level = 1; level <= 10; level++) {
    const { systemId, nodeId } = core.dispatch({
      type: 'system.extract',
      payload: { systemId: system, nodeIds: [target], name: `Level ${level}` },
    })
    composites.push(nodeId)
    system = systemId
    target = leaf
  }
  assert.equal(core.node(leaf).systemId, system)
  const [path] = core.pathsTo(system)
  assert.equal(path.length, 11)
  assert.deepEqual(
    path.slice(1).map(p => core.system(p.systemId).name),
    Array.from({ length: 10 }, (_, i) => `Level ${i + 1}`)
  )
  assert.ok(core.containsSystem(root, system))
  const resolved = core.resolvePort(core.edgesOf(root)[0].toPort)
  assert.equal(
    resolved.port.id,
    port(core, leaf, 'in'),
    'the client edge resolves through ten boundary ports'
  )
  assert.equal(resolved.boundaryPortIds.length, 10)
  assert.equal(core.rollup(root, 'serviceTime.p99').value, 7, 'values roll up through every level')
  assert.deepEqual(core.problems(), [])
  for (let i = 0; i < 10; i++) core.undo()
  assert.equal(core.node(leaf).systemId, root)
  assert.equal(core.all('system').length, 1)
})

/**
 * Moves `nodeId` `levels` levels down by extracting it into a new system each time. Returns the
 * composite nodes from the root down, the path to the innermost system.
 */
function nest(core, systemId, nodeId, levels) {
  const path = []
  let system = systemId
  for (let level = 1; level <= levels; level++) {
    const extracted = core.dispatch({
      type: 'system.extract',
      payload: { systemId: system, nodeIds: [nodeId], name: `Level ${level}` },
    })
    path.push(extracted.nodeId)
    system = extracted.systemId
  }
  return path
}

describe('the recursion resolver', () => {
  it('a placement that creates a cycle fails with E_SYSTEM_CYCLE', () => {
    const { core } = setup()
    const a = core.dispatch({ type: 'system.create', payload: { name: 'A' } })
    const b = core.dispatch({ type: 'system.create', payload: { name: 'B' } })
    core.dispatch({ type: 'node.place', payload: { systemId: a, systemRef: b } })
    const before = core.snapshot()
    for (const placement of ['reference', 'value'])
      assert.deepEqual(
        core.tryDispatch({ type: 'node.place', payload: { systemId: b, systemRef: a, placement } }),
        { ok: false, code: 'E_SYSTEM_CYCLE', details: { systemId: b, systemRef: a } },
        placement
      )
    assert.deepEqual(core.snapshot(), before)
  })

  it('editing inside a by-reference inner system fails with E_SYSTEM_READONLY', () => {
    const { core, root } = setup()
    const library = core.dispatch({ type: 'system.create', payload: { name: 'Auth' } })
    const token = add(core, library, 'base:service', 'Token service')
    const [owned] = nest(core, library, token, 1)
    const byRef = core.dispatch({
      type: 'node.place',
      payload: { systemId: root, systemRef: library },
    })
    const byValue = core.dispatch({
      type: 'node.place',
      payload: { systemId: root, systemRef: library, placement: 'value' },
    })

    const inside = core.resolveSystem([byRef])
    assert.deepEqual(inside, { systemId: library, depth: 1, readOnly: true, path: [byRef] })
    assert.equal(core.resolveSystem([byRef, owned]).readOnly, true, 'at every depth below it')
    assert.equal(core.resolveSystem([byValue]).readOnly, false, 'a copy is editable')
    assert.equal(core.resolveSystem([]).systemId, root)

    const before = core.snapshot()
    const addHere = { type: 'component.add', payload: { systemId: library, typeRef: 'base:store' } }
    assert.throws(
      () => core.dispatch(addHere, { at: [byRef] }),
      err => err.code === 'E_SYSTEM_READONLY' && err.details.viaNodeId === byRef
    )
    assert.deepEqual(core.snapshot(), before)
    core.dispatch(addHere, { at: [] })
    assert.equal(
      core.nodesOf(library).length,
      2,
      'the library system (its composite, now with a store) is edited at its source'
    )
  })

  it('walk visits every component of a three-level graph exactly once and honours maxDepth', () => {
    const { core, root } = setup()
    const client = add(core, root, 'base:client', 'Client')
    const service = add(core, root, 'test.service', 'Service')
    const [first] = nest(core, root, service, 1)
    const level1 = core.node(first).systemRef
    const db = add(core, level1, 'test.db', 'DB')
    const [second] = nest(core, level1, db, 1)
    const library = core.dispatch({ type: 'system.create', payload: { name: 'Shared' } })
    const shared = add(core, library, 'base:store', 'Shared store')
    const refs = [1, 2].map(() =>
      core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: library } })
    )

    const seen = []
    core.walk(root, (node, { depth }) => seen.push([core.node(node.id).name, depth]))
    assert.deepEqual(
      seen.map(([name]) => name).sort(),
      ['Client', 'DB', 'Level 1', 'Level 1', 'Service', 'Shared', 'Shared 2', 'Shared store'].sort()
    )
    assert.equal(
      new Set(seen.map(([name, depth]) => `${name}@${depth}`)).size,
      seen.length,
      'each once'
    )
    assert.deepEqual(
      Object.fromEntries(seen.filter(([name]) => ['DB', 'Shared store'].includes(name))),
      { DB: 2, 'Shared store': 1 }
    )

    const shallow = []
    core.walk(root, node => shallow.push(node.id), { maxDepth: 1 })
    assert.ok(shallow.includes(service) && shallow.includes(second) && !shallow.includes(db))
    const top = []
    core.walk(root, node => top.push(node.id), { maxDepth: 0 })
    assert.deepEqual(top.sort(), [client, first, ...refs].sort())
    void shared
  })

  it('the resolver refuses a system deeper than 64 levels with E_SYSTEM_TOO_DEEP', () => {
    const { core, root } = setup()
    const leaf = add(core, root, 'base:service', 'Leaf')
    const path = nest(core, root, leaf, 65)
    assert.equal(core.resolveSystem(path.slice(0, 64)).depth, 64)
    assert.throws(
      () => core.resolveSystem(path),
      err => err.code === 'E_SYSTEM_TOO_DEEP'
    )
    assert.throws(
      () => core.walk(root, () => {}),
      err => err.code === 'E_SYSTEM_TOO_DEEP'
    )
  })
})
