import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SystemHandle } from '../src/index.js'
import { createTestStrata } from './fixtures.js'

describe('facade handles', () => {
  it('handles re-read state, so a rename made by command is visible through an older handle', async () => {
    const { strata } = createTestStrata()
    const p = await strata.projects.create('checkout')
    const svc = p.root.add('service', { name: 'Orders' })
    const older = p.root.node('Orders')
    p.dispatch({ type: 'node.update', payload: { id: svc.id, changes: { name: 'Billing' } } })
    assert.equal(older.name, 'Billing')
    const sub = p.root.extract([svc], { name: 'Core' })
    p.dispatch({
      type: 'system.update',
      payload: { id: sub.id, changes: { name: 'Orders system' } },
    })
    assert.equal(sub.name, 'Orders system')
    assert.equal(older.system.id, sub.id, 'an older handle follows its node into the new system')
    p.undo()
    assert.equal(sub.name, 'Core')
  })

  it('a component opened as a system, its methods, its bindings and edges that name a method are reachable from handles', async () => {
    const { strata } = createTestStrata()
    const p = await strata.projects.create('checkout')
    const root = p.root
    const svc = root.add('service', { name: 'Orders' })
    const db = root.add('relational-db', { name: 'Orders DB' })
    const edge = root.connect(svc.port('db'), db.port('in'), {
      type: 'db-protocol',
      method: 'insert',
    })
    assert.equal(edge.method, 'insert')
    edge.update({ method: 'query' })
    assert.equal(edge.method, 'query')
    assert.throws(
      () => root.connect(svc.port('db'), db.port('in'), { type: 'db-protocol', method: 'lock' }),
      err => err.code === 'E_METHOD_NOT_EXPOSED',
      'a private method is never reachable over an edge'
    )

    const methods = db.methods()
    assert.deepEqual(
      methods.filter(m => m.visibility === 'public').map(m => m.name),
      ['query', 'insert', 'update', 'delete', 'begin', 'commit', 'rollback']
    )
    assert.deepEqual(methods.find(m => m.name === 'insert')?.ports, ['in'])
    assert.deepEqual(
      methods.filter(m => m.visibility === 'private').map(m => m.name),
      ['acquireConnection', 'lock', 'replicate', 'failover']
    )
    assert.deepEqual(svc.state(), { backlog: [], circuits: {} })

    const inner = svc.openAsSystem()
    assert.ok(inner instanceof SystemHandle)
    assert.equal(svc.child?.id, inner.id)
    assert.equal(svc.type, 'starter.service@1.0.0', 'it keeps its type, its black-box model')
    const worker = inner.add('service', { name: 'Health worker' })
    const bp = inner.port('in').map(worker.port('in'))
    bp.bind('health', worker)
    assert.deepEqual(Object.keys(bp.bindings), ['health'])
    assert.equal(bp.bindings.health.node.id, worker.id)
    const resolved = svc.resolve('health')
    assert.equal(resolved.node.id, worker.id)
    assert.deepEqual(
      resolved.path.map(hop => `${hop.node.name}.${hop.method}`),
      ['Orders.health', 'Health worker.health']
    )
    bp.unbind('health')
    assert.throws(
      () => svc.resolve('health'),
      err => err.code === 'E_METHOD_UNBOUND'
    )
  })

  it('the spec §18 console example runs in Node up to the first simulation call', async () => {
    const { strata } = createTestStrata()
    await strata.projects.create('checkout')

    // Spec §18, as written, up to strata.sim.start.
    const p = await strata.projects.open('checkout')
    const root = p.root

    const gw = root.add('api-gateway', { name: 'Edge GW', props: { rateLimit: 1000 } })
    const svc = root.add('service', { name: 'Orders' })
    const db = root.add('relational-db', { name: 'Orders DB' })
    root.connect(gw.port('out'), svc.port('in'), { type: 'http' })
    root.connect(svc.port('db'), db.port('in'), { type: 'db-protocol', method: 'insert' })

    svc.methods() // public and private methods with signatures
    svc.state() // typed initial state
    const inner = svc.openAsSystem() // give any component an inner system
    inner.enter() // drill down; the UI follows if attached
    const orders = root.extract([svc.id, db.id], { name: 'Orders System' }) // roll-up
    orders.rollup('latency.p99') // derived value

    assert.deepEqual(
      root.nodes().map(n => n.name),
      ['Edge GW', 'Orders System']
    )
    assert.equal(orders.rollup('latency.p99'), 95, 'service p99 80 ms + database p99 15 ms')
    assert.equal(svc.child?.id, inner.id, 'the opened component moved into the new system')
    assert.deepEqual(
      orders.nodes().map(n => n.name),
      ['Orders', 'Orders DB']
    )
  })
})
