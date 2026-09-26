import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store, Tx, SCHEMA_VERSION } from '../src/index.js'

const meta = { actorId: 'u1', timestamp: '2026-09-25T09:00:00.000Z' }

function seeded() {
  const store = new Store()
  const tx = new Tx(store, meta)
  tx.create('system', { id: 's1', name: 'Root', ownerNodeId: null })
  tx.create('node', { id: 'n1', systemId: 's1', name: 'A', props: { x: 1 } })
  tx.create('node', { id: 'n2', systemId: 's1', name: 'B', props: {} })
  return { store, tx }
}

test('created entities carry metadata and are frozen', () => {
  const { store } = seeded()
  const n = store.get('node', 'n1')
  assert.deepEqual(
    { createdBy: n.createdBy, createdAt: n.createdAt, updatedBy: n.updatedBy, rev: n.rev },
    { createdBy: 'u1', createdAt: meta.timestamp, updatedBy: 'u1', rev: 1 }
  )
  assert.ok(Object.isFrozen(n) && Object.isFrozen(n.props))
  assert.throws(() => {
    n.name = 'X'
  }, TypeError)
})

test('indexes follow updates and deletes', () => {
  const { store, tx } = seeded()
  tx.create('system', { id: 's2', name: 'Child', ownerNodeId: 'n1' })
  assert.deepEqual(
    store.find('node', 'systemId', 's1').map(n => n.id),
    ['n1', 'n2']
  )
  tx.update('node', 'n2', { systemId: 's2' })
  assert.deepEqual(
    store.find('node', 'systemId', 's1').map(n => n.id),
    ['n1']
  )
  assert.deepEqual(
    store.find('node', 'systemId', 's2').map(n => n.id),
    ['n2']
  )
  tx.remove('node', 'n2')
  assert.deepEqual(store.find('node', 'systemId', 's2'), [])
  assert.throws(() => store.find('node', 'name', 'A'), /not indexed/)
})

test('updates bump rev, ignore no-op changes and protect metadata', () => {
  const { store } = seeded()
  const tx = new Tx(store, { actorId: 'u2', timestamp: '2026-09-25T10:00:00.000Z' })
  const same = tx.update('node', 'n1', { name: 'A' })
  assert.equal(same.rev, 1)
  assert.equal(tx.changed, false)
  const next = tx.update('node', 'n1', { name: 'A2', ignored: undefined })
  assert.equal(next.rev, 2)
  assert.equal(next.updatedBy, 'u2')
  assert.equal(next.createdBy, 'u1')
  assert.ok(!('ignored' in next))
  assert.throws(() => tx.update('node', 'n1', { rev: 9 }), /managed by the store/)
  assert.throws(
    () => tx.create('node', { id: 'n1', systemId: 's1' }),
    err => err.code === 'CONFLICT'
  )
  assert.throws(
    () => tx.update('node', 'zzz', {}),
    err => err.code === 'NOT_FOUND'
  )
})

test('rollback restores every touched entity', () => {
  const { store } = seeded()
  const before = store.snapshot()
  const tx = new Tx(store, meta)
  tx.update('node', 'n1', { name: 'changed' })
  tx.remove('node', 'n2')
  tx.create('node', { id: 'n3', systemId: 's1', name: 'C' })
  assert.equal(store.count('node'), 2)
  tx.rollback()
  assert.deepEqual(store.snapshot(), before)
  assert.deepEqual(
    store.find('node', 'systemId', 's1').map(n => n.id),
    ['n1', 'n2']
  )
})

test('changes and inverse describe the net effect', () => {
  const { store } = seeded()
  const tx = new Tx(store, meta)
  tx.update('node', 'n1', { name: 'A2' })
  tx.update('node', 'n1', { name: 'A3' })
  tx.remove('node', 'n2')
  tx.create('node', { id: 'tmp', systemId: 's1' })
  tx.remove('node', 'tmp')
  tx.create('node', { id: 'n3', systemId: 's1' })
  assert.deepEqual(tx.changes(), [
    { kind: 'node', id: 'n1', action: 'update' },
    { kind: 'node', id: 'n2', action: 'delete' },
    { kind: 'node', id: 'n3', action: 'create' },
  ])
  const inverse = tx.inverse()
  assert.equal(inverse.find(e => e.id === 'n1').value.name, 'A')
  assert.equal(inverse.find(e => e.id === 'n2').value.name, 'B')
  assert.equal(inverse.find(e => e.id === 'n3').value, null)
  assert.equal(
    inverse.find(e => e.id === 'tmp'),
    undefined
  )
})

test('savepoints roll back part of a transaction', () => {
  const { store } = seeded()
  const tx = new Tx(store, meta)
  tx.update('node', 'n1', { name: 'outer' })
  const sp = tx.savepoint()
  tx.update('node', 'n1', { name: 'inner' })
  tx.create('node', { id: 'n3', systemId: 's1' })
  tx.rollbackTo(sp)
  assert.equal(store.get('node', 'n1').name, 'outer')
  assert.equal(store.get('node', 'n3'), undefined)
  const sp2 = tx.savepoint()
  tx.update('node', 'n2', { name: 'kept' })
  tx.release(sp2)
  tx.rollback()
  assert.equal(store.get('node', 'n1').name, 'A')
  assert.equal(store.get('node', 'n2').name, 'B')
})

test('restore writes captured values back and moves rev forward', () => {
  const { store } = seeded()
  const original = store.get('node', 'n1')
  const tx = new Tx(store, meta)
  tx.update('node', 'n1', { name: 'changed' })
  const tx2 = new Tx(store, { actorId: 'u9', timestamp: '2026-09-25T11:00:00.000Z' })
  tx2.restore('node', 'n1', original)
  const restored = store.get('node', 'n1')
  assert.equal(restored.name, 'A')
  assert.equal(restored.rev, 3)
  assert.equal(restored.updatedBy, 'u9')
  tx2.restore('node', 'n2', null)
  assert.equal(store.get('node', 'n2'), undefined)
  assert.throws(() => tx2.restore('node', 'n1', { ...original, id: 'other' }), /different id/)
})

test('snapshots round-trip and are stable', () => {
  const { store } = seeded()
  store.rev = 3
  const snap = store.snapshot()
  assert.equal(snap.schemaVersion, SCHEMA_VERSION)
  assert.equal(snap.project, null)
  assert.deepEqual(
    snap.nodes.map(n => n.id),
    ['n1', 'n2']
  )
  const copy = new Store()
  copy.load(JSON.parse(JSON.stringify(snap)))
  assert.deepEqual(copy.snapshot(), snap)
  assert.equal(copy.rev, 3)
  assert.deepEqual(
    copy.find('node', 'systemId', 's1').map(n => n.id),
    ['n1', 'n2']
  )
  assert.throws(
    () => copy.load({ ...snap, schemaVersion: 99 }),
    err => err.code === 'UNSUPPORTED'
  )
  assert.throws(() => copy.get('widget', 'x'), /Unknown entity kind/)
})
