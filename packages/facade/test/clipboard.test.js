import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestStrata } from './fixtures.js'

async function setup() {
  const t = createTestStrata()
  const p = await t.strata.projects.create('clip')
  const root = p.root
  const gw = root.add('api-gateway', { name: 'GW', at: { x: 100, y: 100 } })
  const svc = root.add('service', {
    name: 'Orders',
    props: { concurrency: 8 },
    at: { x: 300, y: 100 },
  })
  const db = root.add('relational-db', { name: 'Orders DB', at: { x: 300, y: 260 } })
  svc.addPort('metrics', { direction: 'out', accepts: ['http'] })
  root.connect(gw.port('out'), svc.port('in'), { type: 'http', label: 'REST' })
  root.connect(svc.port('db'), db.port('in'))
  return { ...t, p, root, gw, svc, db }
}

test('copy captures nodes, props, extra ports, positions and the edges between them', async () => {
  const { strata, svc, db, gw } = await setup()
  strata.select(svc, db)
  const clip = strata.copy()
  assert.equal(clip.format, 'strata/clip@1')
  assert.deepEqual(
    clip.nodes.map(n => [n.name, n.at]),
    [
      ['Orders', { x: 0, y: 0 }],
      ['Orders DB', { x: 0, y: 160 }],
    ]
  )
  assert.deepEqual(clip.nodes[0].props, { concurrency: 8 })
  assert.deepEqual(clip.nodes[0].extraPorts, [
    { name: 'metrics', direction: 'out', accepts: ['http'] },
  ])
  assert.deepEqual(
    clip.edges.map(e => `${e.from.node}.${e.from.port} → ${e.to.node}.${e.to.port}`),
    ['0.db → 1.in'],
    'only edges inside the copy'
  )
  assert.equal(JSON.parse(JSON.stringify(clip)).nodes.length, 2, 'plain JSON')
  void gw
})

test('pasted copies keep percentages as they were', async () => {
  const { strata, p, svc } = await setup()
  svc.set({ availabilityTarget: 99.95 })
  strata.copy([svc])
  const [copy] = strata.paste({ into: p.createSystem('Elsewhere') })
  assert.deepEqual(copy.props, svc.props)
  assert.equal(
    copy.props.availabilityTarget,
    0.9995,
    'stored as a fraction, not read again as points'
  )
})

test('paste into another system adds copies with their edges, as one undo step', async () => {
  const { strata, p, svc, db } = await setup()
  strata.copy([svc, db])
  const lib = p.createSystem('Orders platform')
  const pasted = strata.paste({ into: lib, at: { x: 500, y: 500 } })
  assert.deepEqual(
    pasted.map(n => n.name),
    ['Orders', 'Orders DB']
  )
  assert.deepEqual(
    pasted.map(n => n.position),
    [
      { x: 500, y: 500 },
      { x: 500, y: 660 },
    ]
  )
  assert.equal(pasted[0].props.concurrency, 8)
  assert.deepEqual(
    pasted[0].ports().map(port => port.name),
    ['in', 'out', 'db', 'metrics']
  )
  assert.deepEqual(
    lib.edges().map(e => String(e)),
    ['Edge<Orders.db → Orders DB.in>']
  )
  assert.deepEqual(strata.$.ids(), pasted.ids(), 'the paste is selected')
  assert.equal(p.oplog.at(-1).command, 'batch')
  p.undo()
  assert.equal(lib.nodes().length, 0)
})

test('pasting into the same system renames clashes; duplicate offsets the copies', async () => {
  const { strata, root, svc, db } = await setup()
  const copies = strata.duplicate([svc, db])
  assert.deepEqual(
    copies.map(n => n.name),
    ['Orders copy', 'Orders DB copy']
  )
  assert.deepEqual(
    copies.map(n => n.position),
    [
      { x: 340, y: 140 },
      { x: 340, y: 300 },
    ]
  )
  const again = strata.duplicate([svc])
  assert.deepEqual(
    again.map(n => n.name),
    ['Orders copy 2']
  )
  assert.equal(root.nodes().length, 6)
})

test('composites: references stay references, values become new copies, cycles are skipped', async () => {
  const { strata, p, root, svc, db } = await setup()
  const orders = root.extract([svc, db], { name: 'Orders System' })
  const auth = p.createSystem('Auth')
  auth.add('service', { name: 'Auth service' })
  const authRef = root.place(auth, { at: { x: 600, y: 100 } })
  const composite = orders.via

  const clip = strata.copy([composite, authRef])
  const pasted = root.paste(clip, { at: { x: 0, y: 600 } })
  assert.deepEqual(
    pasted.map(n => [n.name, n.placement]),
    [
      ['Orders System copy', 'value'],
      ['Auth copy', 'reference'],
    ]
  )
  assert.notEqual(pasted[0].child.id, orders.id, 'a by-value composite pastes as a fresh copy')
  assert.deepEqual(
    pasted[0].child.nodes().map(n => n.name),
    ['Orders', 'Orders DB']
  )
  assert.equal(
    pasted[1].child.id,
    auth.id,
    'a by-reference composite points at the same library system'
  )

  const intoAuth = auth.paste(strata.copy([authRef]))
  assert.equal(intoAuth.length, 0)
  assert.match(intoAuth.skipped[0].reason, /contain itself/)
})

test('paste needs a clip and a writable target', async () => {
  const { strata, p } = await setup()
  assert.throws(() => strata.paste(), /clipboard is empty/)
  assert.throws(() => strata.copy([]), /Nothing to copy/)
  assert.throws(() => p.root.paste({ format: 'other' }), /Not a Strata clip/)
  const lib = p.createSystem('Shared')
  const placed = p.root.place(lib)
  const clip = strata.copy([p.root.node('GW')])
  assert.throws(
    () => placed.child.paste(clip),
    err => err.code === 'READ_ONLY'
  )
})
