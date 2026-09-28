import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toGraphData, applyIntent, parseId, ids, shapeFor } from '../src/adapter.js'
import { GraphModel } from '../../graph/src/index.js'
import { ordersProject, createFixtureStrata } from './fixtures.js'

const byId = list => Object.fromEntries(list.map(item => [item.id, item]))

test('the root system maps to nodes, ports and edges with positions from its view', async () => {
  const { root, client, gw, orders } = await ordersProject()
  const { data, viewId } = toGraphData(root)
  assert.ok(viewId)
  const nodes = byId(data.nodes)
  assert.deepEqual(Object.keys(nodes), [client.id, gw.id, orders.via.id])
  assert.deepEqual(
    [nodes[client.id].x, nodes[client.id].y, nodes[client.id].shape],
    [0, 100, 'person']
  )
  assert.equal(nodes[gw.id].shape, 'hexagon', 'shape from the base type in its lineage')
  assert.equal(nodes[gw.id].sublabel, 'API gateway')
  assert.deepEqual(
    nodes[gw.id].ports.map(p => [p.side, p.direction]),
    [
      ['left', 'in'],
      ['right', 'out'],
    ]
  )
  const composite = nodes[orders.via.id]
  assert.equal(composite.composite, true)
  assert.equal(composite.sublabel, '▣ 2 nodes')
  assert.equal(data.frames.length, 0, 'no frame at the root')
  assert.equal(data.edges.length, 2)
  assert.deepEqual(new GraphModel(data).problems, [], 'the data is valid for strata-graph')
})

test('nodes without a position are placed on a grid below the laid-out ones', async () => {
  const { root } = await ordersProject()
  const a = root.add('starter.queue', { name: 'Q1' })
  const b = root.add('starter.queue', { name: 'Q2' })
  const { data, autoPlaced } = toGraphData(root)
  const nodes = byId(data.nodes)
  assert.deepEqual(Object.keys(autoPlaced).sort(), [a.id, b.id].sort())
  assert.ok(nodes[a.id].y > 164, 'below the existing nodes')
  assert.equal(nodes[b.id].x - nodes[a.id].x, 220)
  assert.equal(nodes[a.id].shape, 'queue')
})

test('inside a composite: a system frame, boundary ports on its edge, mapping edges and context ghosts', async () => {
  const { orders, svc, db, gw } = await ordersProject()
  const { data } = toGraphData(orders)
  const nodes = byId(data.nodes)
  const [frame] = data.frames
  assert.equal(frame.kind, 'system')
  assert.match(frame.label, /^Orders · container/)
  assert.ok(
    frame.x < nodes[svc.id].x && frame.x + frame.w > nodes[db.id].x + nodes[db.id].w,
    'the frame surrounds the contents'
  )

  const [bp] = orders.ports()
  const bpNode = nodes[ids.bp(bp.id)]
  assert.equal(bpNode.shape, 'boundary-port')
  assert.equal(bpNode.x + bpNode.w / 2, frame.x, 'an input boundary port sits on the left edge')
  assert.deepEqual(
    [bpNode.side, bpNode.w, bpNode.h],
    ['left', 12, 12],
    'a 12 px half-disc on the frame side the graph draws it against'
  )
  assert.deepEqual(
    bpNode.ports.map(p => [p.side, p.direction]),
    [['right', 'out']],
    'inside, traffic comes out of it'
  )
  assert.equal(bpNode.locked, true)

  const edges = byId(data.edges)
  const map = edges[ids.map(bp.id)]
  assert.deepEqual(
    [map.source.node, map.target],
    [ids.bp(bp.id), { node: svc.id, port: svc.port('in').id }]
  )

  const ghost = nodes[ids.ghost(gw.id)]
  assert.equal(ghost.ghost, true)
  assert.equal(ghost.sublabel, 'in Shop')
  assert.ok(ghost.x + ghost.w < frame.x, 'the parent neighbour is outside, on the input side')
  const ghostEdge = data.edges.find(e => e.id.startsWith('ghostedge:'))
  assert.deepEqual([ghostEdge.source.node, ghostEdge.target.node], [ghost.id, bpNode.id])
  assert.deepEqual(new GraphModel(data).problems, [])
})

test('synthetic ids round-trip', () => {
  assert.deepEqual(parseId(ids.bp('X')), { kind: 'bp', id: 'X' })
  assert.deepEqual(parseId(ids.ghostEdge('E')), { kind: 'ghostedge', id: 'E' })
  assert.deepEqual(parseId('01ABC'), { kind: 'model', id: '01ABC' })
})

test('move, resize and waypoints become view layout commands', async () => {
  const { strata, p, root, gw, orders } = await ordersProject()
  const { viewId, data } = toGraphData(root)
  const ctx = { strata, system: root, viewId }
  applyIntent(
    {
      type: 'move',
      items: [
        { id: gw.id, kind: 'node', x: 260, y: 140, parent: null },
        { id: 'frame:x', kind: 'frame', x: 0, y: 0 },
      ],
    },
    ctx
  )
  assert.deepEqual(gw.position, { x: 260, y: 140 })
  applyIntent(
    { type: 'resize', id: orders.via.id, kind: 'node', x: 440, y: 100, w: 200, h: 90 },
    ctx
  )
  const view = root.views()[0]
  assert.deepEqual(view.layout[orders.via.id], { x: 440, y: 100, w: 200, h: 90 })
  const edge = data.edges[0]
  applyIntent({ type: 'waypoints', edge: edge.id, waypoints: [{ x: 100, y: 300 }] }, ctx)
  assert.deepEqual(root.views()[0].layout[edge.id].waypoints, [{ x: 100, y: 300 }])
  assert.equal(p.oplog.at(-1).command, 'view.layout')
})

test('a move whose items carry sizes resizes them too, in one layout command', async () => {
  const { strata, p, root, gw, orders } = await ordersProject()
  const ctx = { strata, system: root, viewId: toGraphData(root).viewId }
  const before = p.oplog.length
  applyIntent(
    {
      type: 'move',
      items: [
        { id: gw.id, kind: 'node', x: 260, y: 140, w: 240, h: 90, parent: null },
        { id: orders.via.id, kind: 'node', x: 520, y: 140, w: 250, h: 100, parent: null },
      ],
    },
    ctx
  )
  const layout = root.views()[0].layout
  assert.deepEqual(layout[gw.id], { x: 260, y: 140, w: 240, h: 90 })
  assert.deepEqual(layout[orders.via.id], { x: 520, y: 140, w: 250, h: 100 })
  assert.equal(p.oplog.length, before + 1)
})

test('connect maps boundary ports and adds edges between compatible nodes', async () => {
  const { strata, root, orders, svc, gw } = await ordersProject()
  const extra = root.add('starter.service', { name: 'Search' })
  const ctx = { strata, system: root, viewId: toGraphData(root).viewId }
  applyIntent(
    {
      type: 'connect',
      source: { node: gw.id, port: gw.port('out').id },
      target: { node: extra.id, port: extra.port('in').id },
    },
    ctx
  )
  assert.deepEqual(
    extra
      .port('in')
      .edges()
      .map(e => String(e)),
    ['Edge<Gateway.out → Search.in>']
  )

  const inner = orders.add('starter.service', { name: 'Orders v2' })
  const [bp] = orders.ports()
  const inside = { strata, system: orders, viewId: toGraphData(orders).viewId }
  applyIntent(
    {
      type: 'connect',
      source: { node: ids.bp(bp.id), port: 'port' },
      target: { node: inner.id, port: inner.port('in').id },
    },
    inside
  )
  assert.equal(
    orders.port(bp.entity.name).internal.id,
    inner.port('in').id,
    'the input boundary port now serves Orders v2'
  )
  const outNode = orders.add('starter.gateway', { name: 'Egress' })
  const out = orders.expose(outNode.port('out'), { name: 'events' })
  applyIntent(
    {
      type: 'reconnect',
      edge: ids.map(out.id),
      end: 'source',
      to: { node: inner.id, port: inner.port('out').id },
    },
    inside
  )
  assert.equal(out.internal.id, inner.port('out').id)
  void svc
})

test('delete removes nodes, edges and boundary ports in one undo step', async () => {
  const { strata, p, root, orders, gw, client } = await ordersProject()
  const [bp] = orders.ports()
  const edgeId = root.edges()[0].id
  applyIntent(
    { type: 'delete', ids: [gw.id, edgeId, 'frame:whatever'] },
    { strata, system: root, viewId: toGraphData(root).viewId }
  )
  assert.deepEqual(
    root.nodes().map(n => n.name),
    ['Web', 'Orders']
  )
  applyIntent({ type: 'delete', ids: [ids.map(bp.id)] }, { strata, system: orders, viewId: null })
  assert.equal(
    orders.port(bp.entity.name).internal,
    null,
    'deleting a mapping edge unmaps the boundary port'
  )
  applyIntent({ type: 'delete', ids: [ids.bp(bp.id)] }, { strata, system: orders, viewId: null })
  assert.equal(orders.ports().length, 0)
  p.undo()
  p.undo()
  p.undo()
  assert.deepEqual(
    root.nodes().map(n => n.name),
    ['Web', 'Gateway', 'Orders']
  )
  void client
})

test('select, open, drop, quick add and context menus', async () => {
  const { strata, root, gw, orders } = await ordersProject()
  const ctx = { strata, system: root, viewId: toGraphData(root).viewId }
  assert.deepEqual(applyIntent({ type: 'select', ids: [gw.id, 'ghost:zzz'] }, ctx), {
    select: [gw.id, 'ghost:zzz'],
  })
  assert.ok(strata.$.equals(gw), 'only model ids reach the facade selection')
  assert.deepEqual(applyIntent({ type: 'open', id: orders.via.id, kind: 'node' }, ctx), {
    enter: orders.via.id,
  })
  assert.deepEqual(applyIntent({ type: 'open', id: gw.id, kind: 'node' }, ctx), { inspect: gw.id })
  const dropped = applyIntent(
    { type: 'drop', data: { typeRef: 'starter.queue' }, x: 600, y: 400 },
    ctx
  )
  const node = root.node(dropped.select[0])
  assert.equal(node.type, 'starter.queue@1.0.0')
  assert.deepEqual(node.position, { x: 520, y: 370 })
  const lib = root.project.createSystem('Payments')
  const placed = applyIntent({ type: 'drop', data: { systemRef: lib.id }, x: 100, y: 500 }, ctx)
  assert.equal(root.node(placed.select[0]).placement, 'reference')
  assert.deepEqual(
    applyIntent({ type: 'connect-to-point', source: { node: gw.id, port: 'p' }, x: 1, y: 2 }, ctx)
      .quickAdd,
    { source: { node: gw.id, port: 'p' }, x: 1, y: 2 }
  )
  assert.equal(
    applyIntent(
      { type: 'context', id: gw.id, kind: 'node', clientX: 5, clientY: 6, x: 7, y: 8 },
      ctx
    ).contextMenu.id,
    gw.id
  )
})

test('read-only systems refuse changes', async () => {
  const strata = createFixtureStrata()
  const p = await strata.projects.create('RO')
  const lib = p.createSystem('Shared')
  lib.add('starter.service', { name: 'S' })
  const inside = p.root.place(lib).child
  assert.equal(inside.readOnly, true)
  const ctx = { strata, system: inside, viewId: toGraphData(inside).viewId }
  assert.throws(() => applyIntent({ type: 'move', items: [] }, ctx), /read-only/)
  assert.deepEqual(applyIntent({ type: 'connect-to-point', source: {}, x: 0, y: 0 }, ctx), {})
  assert.match(toGraphData(inside).data.frames[0].label, /read-only/)
})

test('shapeFor uses the manifest shape, then the lineage, then placeholders', async () => {
  const strata = createFixtureStrata()
  strata.components.register({
    id: 'x.custom',
    name: 'Custom',
    version: '1.0.0',
    extends: 'base:service',
    shape: 'diamond',
  })
  const p = await strata.projects.create('Shapes')
  assert.equal(shapeFor(p.root.add('x.custom')), 'diamond')
  assert.equal(shapeFor(p.root.add('base:external')), 'cloud')
  assert.equal(shapeFor(p.root.add('ghost.type@1.0.0', { ports: [] })), 'placeholder')
})
