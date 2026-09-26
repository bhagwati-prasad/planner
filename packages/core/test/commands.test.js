import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, add, port, connect, modelState } from './helpers.js'

test('project.init creates the project, root system and a default view; only once', () => {
  const { core, root } = setup()
  const project = core.project
  assert.equal(project.name, 'Checkout')
  assert.equal(project.rootSystemId, root)
  assert.equal(core.system(root).levelTag, 'context')
  assert.deepEqual(
    core.viewsOf(root).map(v => [v.name, v.kind]),
    [['Logical', 'logical']]
  )
  assert.throws(
    () => core.dispatch({ type: 'project.init', payload: { name: 'Again' } }),
    err => err.code === 'CONFLICT'
  )
  core.dispatch({
    type: 'project.update',
    payload: { changes: { name: 'Checkout v2', settings: { theme: 'dark' } } },
  })
  assert.equal(core.project.name, 'Checkout v2')
  assert.throws(
    () => core.dispatch({ type: 'project.update', payload: { changes: { rootSystemId: 'x' } } }),
    /cannot be changed/
  )
})

test('node.add creates ports from the manifest, pins the version and validates props', () => {
  const { core, root } = setup()
  const q = add(core, root, 'acme.message-queue', undefined, {
    props: { capacity: 500, retention: '2d' },
  })
  const node = core.node(q)
  assert.equal(node.name, 'Message Queue')
  assert.equal(node.typeRef, 'acme.message-queue@1.2.0')
  assert.equal(node.status, 'planned')
  assert.deepEqual(
    core.portsOf(q).map(p => [p.name, p.direction, p.accepts.join()]),
    [
      ['in', 'in', 'async-message'],
      ['out', 'out', 'async-message'],
      ['dlq', 'out', 'async-message'],
    ]
  )
  assert.ok('acme.message-queue@1.2.0' in core.project.components)
  assert.equal(core.effectiveProps(q).capacity, 500)
  assert.equal(core.effectiveProps(q).overflowPolicy, 'reject', 'defaults fill in')
  assert.deepEqual(core.explainProps(q).capacity, {
    value: 500,
    source: 'override',
    unit: 'messages',
    group: 'Capacity',
  })
  assert.equal(core.explainProps(q).overflowPolicy.source, 'default')

  const second = add(core, root, 'acme.message-queue')
  assert.equal(core.node(second).name, 'Message Queue 2', 'default names are unique per system')
  assert.throws(
    () => add(core, root, 'acme.message-queue', 'Q', { props: { capacty: 1 } }),
    /Unknown property 'capacty'.*Did you mean 'capacity'/
  )
  assert.throws(
    () => add(core, root, 'acme.message-queue', 'Q', { props: { overflowPolicy: 'explode' } }),
    /must be one of/
  )
  assert.throws(
    () => add(core, root, 'nonexistent'),
    err => err.code === 'NOT_FOUND'
  )
  assert.throws(() => add(core, root, 'base:component'), /abstract/)
  assert.throws(
    () => add(core, root, 'base:service', 'X', { status: 'imaginary' }),
    /status must be one of/
  )
})

test('unversioned types use the version the project already pins', () => {
  const { core, root } = setup()
  add(core, root, 'acme.message-queue', 'Old')
  core.registry.register({ ...core.registry.get('acme.message-queue'), version: '2.0.0' })
  const next = add(core, root, 'acme.message-queue', 'Pinned')
  assert.equal(core.node(next).typeRef, 'acme.message-queue@1.2.0')
  const explicit = add(core, root, 'acme.message-queue@2.0.0', 'New')
  assert.equal(core.node(explicit).typeRef, 'acme.message-queue@2.0.0', 'several versions coexist')
})

test('a versioned type that is not installed becomes a placeholder that keeps its properties', () => {
  const { core, root } = setup()
  const id = add(core, root, 'acme.legacy@0.9.0', 'Legacy', {
    props: { anything: 1 },
    ports: [{ name: 'in', direction: 'in' }],
  })
  assert.equal(core.node(id).typeRef, 'acme.legacy@0.9.0')
  assert.deepEqual(core.node(id).props, { anything: 1 })
  assert.deepEqual(
    core.portsOf(id).map(p => p.name),
    ['in']
  )
  assert.equal(core.manifestOf(id), null)
})

test('node.update and node.setProps', () => {
  const { core, root } = setup()
  const q = add(core, root, 'acme.message-queue', 'Q', { props: { capacity: 10 } })
  core.dispatch({
    type: 'node.update',
    payload: {
      id: q,
      changes: { name: 'Orders queue', owner: 'team-orders', tags: ['pci'], status: 'existing' },
    },
  })
  assert.deepEqual(
    [core.node(q).name, core.node(q).owner, core.node(q).tags, core.node(q).status],
    ['Orders queue', 'team-orders', ['pci'], 'existing']
  )
  assert.throws(
    () => core.dispatch({ type: 'node.update', payload: { id: q, changes: { typeRef: 'x' } } }),
    /cannot be changed/
  )
  core.dispatch({
    type: 'node.setProps',
    payload: { id: q, props: { retention: '7d' }, unset: ['capacity'] },
  })
  assert.deepEqual(core.node(q).props, { retention: '7d' })
  assert.equal(core.effectiveProps(q).capacity, 100000)
  assert.throws(
    () =>
      core.dispatch({ type: 'node.setProps', payload: { id: q, props: { retention: 'forever' } } }),
    /Invalid duration/
  )
})

test('edges connect compatible ports in one system and pick a connection type', () => {
  const { core, root } = setup()
  const svc = add(core, root, 'test.service', 'Orders')
  const db = add(core, root, 'test.db', 'Orders DB')
  const q = add(core, root, 'acme.message-queue', 'Q')
  const e = connect(core, svc, 'db', db, 'in')
  assert.equal(core.edge(e).connectionType, 'db-protocol')
  assert.equal(core.edge(e).systemId, root)
  assert.throws(() => connect(core, db, 'in', svc, 'in'), /is an input and cannot start/)
  assert.throws(() => connect(core, svc, 'out', svc, 'db'), /is an output and cannot end/)
  assert.throws(() => connect(core, svc, 'out', q, 'in'), /share no connection type/)
  assert.throws(
    () => connect(core, svc, 'db', db, 'in', { connectionType: 'http' }),
    /does not accept 'http'/
  )
  const other = core.dispatch({ type: 'system.create', payload: { name: 'Elsewhere' } })
  const far = add(core, other, 'test.db', 'Far DB')
  assert.throws(() => connect(core, svc, 'db', far, 'in'), /different systems/)
})

test('edges can be relabelled, retyped, re-propertied, rewired and removed', () => {
  const { core, root } = setup()
  const gw = add(core, root, 'base:proxy', 'GW')
  const a = add(core, root, 'test.service', 'A')
  const b = add(core, root, 'test.service', 'B')
  const e = connect(core, gw, 'out', a, 'in', { connectionType: 'http' })
  core.dispatch({
    type: 'edge.update',
    payload: { id: e, changes: { label: 'orders', connectionType: 'grpc' } },
  })
  assert.deepEqual([core.edge(e).label, core.edge(e).connectionType], ['orders', 'grpc'])
  core.dispatch({ type: 'edge.setProps', payload: { id: e, props: { timeout: '1s', retries: 2 } } })
  core.dispatch({ type: 'edge.setProps', payload: { id: e, unset: ['retries'] } })
  assert.deepEqual(core.edge(e).props, { timeout: '1s' })
  core.dispatch({ type: 'edge.rewire', payload: { id: e, toPort: port(core, b, 'in') } })
  assert.equal(core.edge(e).toPort, port(core, b, 'in'))
  core.dispatch({ type: 'edge.remove', payload: { id: e } })
  assert.equal(core.edge(e), undefined)
})

test('extra ports extend a node; declared ports cannot be removed', () => {
  const { core, root } = setup()
  const svc = add(core, root, 'base:service', 'Svc')
  const extra = core.dispatch({
    type: 'port.add',
    payload: { nodeId: svc, name: 'metrics', direction: 'out', accepts: ['http'] },
  })
  assert.equal(core.port(extra).declared, false)
  assert.throws(
    () =>
      core.dispatch({
        type: 'port.add',
        payload: { nodeId: svc, name: 'metrics', direction: 'out' },
      }),
    /already has a port/
  )
  core.dispatch({ type: 'port.update', payload: { id: extra, changes: { name: 'telemetry' } } })
  assert.equal(core.port(extra).name, 'telemetry')
  assert.throws(
    () => core.dispatch({ type: 'port.remove', payload: { id: port(core, svc, 'in') } }),
    /declared by the component/
  )
  core.dispatch({ type: 'port.remove', payload: { id: extra } })
  assert.equal(core.port(extra), undefined)
})

test('removing a node removes its ports, edges and view entries, and unmaps boundary ports', () => {
  const { core, root } = setup()
  const a = add(core, root, 'base:client', 'A')
  const b = add(core, root, 'base:service', 'B')
  const e = connect(core, a, 'out', b, 'in')
  const [view] = core.viewsOf(root)
  core.dispatch({
    type: 'view.layout',
    payload: {
      viewId: view.id,
      set: { [a]: { x: 0, y: 0 }, [b]: { x: 200, y: 0 }, [e]: { waypoints: [{ x: 100, y: 50 }] } },
    },
  })
  const bp = core.dispatch({
    type: 'boundary.add',
    payload: { systemId: root, name: 'api', direction: 'in', internalPortId: port(core, b, 'in') },
  })
  assert.deepEqual(
    core.viewsContaining(b).map(v => v.id),
    [view.id]
  )
  const before = modelState(core)
  core.dispatch({ type: 'node.remove', payload: { id: b } })
  assert.equal(core.edge(e), undefined)
  assert.equal(core.portsOf(b).length, 0)
  assert.deepEqual(Object.keys(core.view(view.id).layout), [a])
  assert.equal(core.boundaryPort(bp).internalPortId, null)
  core.undo()
  assert.deepEqual(modelState(core), before)
})

test('views: create, layout (merging entries), hide and show, keep at least one', () => {
  const { core, root } = setup()
  const a = add(core, root, 'base:service', 'A')
  const [logical] = core.viewsOf(root)
  const deploy = core.dispatch({
    type: 'view.create',
    payload: { systemId: root, name: 'Deployment', kind: 'deployment' },
  })
  core.dispatch({
    type: 'view.layout',
    payload: { viewId: deploy, set: { [a]: { x: 10, y: 20, w: 120, h: 60 } } },
  })
  core.dispatch({ type: 'view.layout', payload: { viewId: deploy, set: { [a]: { x: 30 } } } })
  assert.deepEqual(core.view(deploy).layout[a], { x: 30, y: 20, w: 120, h: 60 })
  assert.throws(
    () =>
      core.dispatch({
        type: 'view.layout',
        payload: { viewId: deploy, set: { [a]: { x: 'left' } } },
      }),
    /x must be a number/
  )
  assert.throws(
    () =>
      core.dispatch({ type: 'view.layout', payload: { viewId: deploy, set: { nope: { x: 1 } } } }),
    err => err.code === 'NOT_FOUND'
  )
  assert.throws(
    () =>
      core.dispatch({
        type: 'view.layout',
        payload: { viewId: deploy, set: { [a]: { layer: 'ghost' } } },
      }),
    /no layer 'ghost'/
  )
  core.dispatch({ type: 'view.hide', payload: { viewId: logical.id, ids: [a] } })
  assert.deepEqual(core.view(logical.id).hidden, [a])
  assert.equal(core.node(a).systemId, root, 'hiding keeps the node in the model')
  assert.deepEqual(
    core.viewsContaining(a).map(v => v.id),
    [deploy]
  )
  core.dispatch({ type: 'view.show', payload: { viewId: logical.id, ids: [a] } })
  assert.deepEqual(core.view(logical.id).hidden, [])
  core.dispatch({
    type: 'view.update',
    payload: {
      id: deploy,
      changes: {
        layers: [
          { id: 'default', name: 'Default' },
          { id: 'infra', name: 'Infra', locked: true },
        ],
      },
    },
  })
  core.dispatch({
    type: 'view.layout',
    payload: { viewId: deploy, set: { [a]: { layer: 'infra' } } },
  })
  core.dispatch({ type: 'view.remove', payload: { id: deploy } })
  assert.throws(
    () => core.dispatch({ type: 'view.remove', payload: { id: logical.id } }),
    /at least one view/
  )
})

test('library systems: create, update, delete when unused', () => {
  const { core, root } = setup()
  const lib = core.dispatch({
    type: 'system.create',
    payload: {
      name: 'Standard Auth Service',
      levelTag: 'container',
      contract: { 'latency.p99': { max: 50, unit: 'ms' } },
    },
  })
  core.dispatch({
    type: 'system.update',
    payload: {
      id: lib,
      changes: { description: 'Shared', rollups: { 'latency.p99': 'critical-path' } },
    },
  })
  assert.equal(core.system(lib).description, 'Shared')
  assert.throws(
    () =>
      core.dispatch({
        type: 'system.update',
        payload: { id: lib, changes: { contract: { p99: { max: 'fast' } } } },
      }),
    /must be a number/
  )
  assert.throws(
    () =>
      core.dispatch({
        type: 'system.update',
        payload: { id: lib, changes: { levelTag: 'galaxy' } },
      }),
    /levelTag/
  )
  assert.throws(
    () =>
      core.dispatch({
        type: 'system.update',
        payload: { id: lib, changes: { rollups: { x: 'average' } } },
      }),
    /rollups.x/
  )
  const node = core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: lib } })
  assert.throws(
    () => core.dispatch({ type: 'system.delete', payload: { id: lib } }),
    err => err.code === 'CONFLICT'
  )
  assert.throws(
    () => core.dispatch({ type: 'system.delete', payload: { id: root } }),
    /root system/
  )
  core.dispatch({ type: 'node.remove', payload: { id: node } })
  assert.ok(core.system(lib), 'removing a by-reference composite keeps the library system')
  core.dispatch({ type: 'system.delete', payload: { id: lib } })
  assert.equal(core.system(lib), undefined)
  assert.equal(core.viewsOf(lib).length, 0)
})

test('boundary ports: mapping rules and propagation to every composite that uses the system', () => {
  const { core, root } = setup()
  const lib = core.dispatch({ type: 'system.create', payload: { name: 'Auth' } })
  const svc = add(core, lib, 'test.service', 'Auth service')
  const n1 = core.dispatch({
    type: 'node.place',
    payload: { systemId: root, systemRef: lib, name: 'Auth A' },
  })
  const n2 = core.dispatch({
    type: 'node.place',
    payload: { systemId: root, systemRef: lib, name: 'Auth B' },
  })
  assert.equal(core.portsOf(n1).length, 0)

  assert.throws(
    () =>
      core.dispatch({
        type: 'boundary.add',
        payload: {
          systemId: lib,
          name: 'in',
          direction: 'in',
          internalPortId: port(core, svc, 'db'),
        },
      }),
    /cannot map to the 'out' port/
  )
  const bp = core.dispatch({
    type: 'boundary.add',
    payload: { systemId: lib, name: 'in', direction: 'in', internalPortId: port(core, svc, 'in') },
  })
  assert.deepEqual(
    core.portsOf(n1).map(p => [p.name, p.direction, p.boundaryPortId]),
    [['in', 'in', bp]]
  )
  assert.deepEqual(
    core.portsOf(n2).map(p => p.name),
    ['in']
  )
  assert.deepEqual(
    core.acceptsOf(core.portsOf(n1)[0]),
    ['http', 'grpc'],
    'a mirror port accepts what the internal port accepts'
  )
  assert.throws(
    () =>
      core.dispatch({
        type: 'boundary.add',
        payload: { systemId: lib, name: 'in', direction: 'in' },
      }),
    /already has a boundary port/
  )

  const client = add(core, root, 'base:client', 'Client')
  const e = connect(core, client, 'out', n1, 'in', { connectionType: 'http' })
  assert.deepEqual(core.resolvePort(core.edge(e).toPort).port.id, port(core, svc, 'in'))

  core.dispatch({ type: 'boundary.update', payload: { id: bp, changes: { name: 'api' } } })
  assert.deepEqual([core.portsOf(n1)[0].name, core.portsOf(n2)[0].name], ['api', 'api'])
  core.dispatch({ type: 'boundary.remove', payload: { id: bp } })
  assert.equal(core.portsOf(n1).length, 0)
  assert.equal(core.edge(e), undefined, 'edges to the removed port go too')
})
