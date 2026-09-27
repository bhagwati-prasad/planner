import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { add, connect, modelState, setup } from './helpers.js'

/** A client calling an Orders service that uses a database. */
function orders() {
  const { core, root } = setup()
  const client = add(core, root, 'base:client', 'Web client')
  const service = add(core, root, 'test.service', 'Orders', {
    props: { monthlyCost: 120, maxRps: 800 },
  })
  const db = add(core, root, 'test.db', 'Orders DB')
  connect(core, client, 'out', service, 'in')
  connect(core, service, 'db', db, 'in')
  return { core, root, service }
}

/** @param {import('../src/index.js').Core} core @param {string} systemId */
const boundary = (core, systemId) =>
  core
    .boundaryPortsOf(systemId)
    .map(bp => `${bp.name}:${bp.direction}`)
    .sort()

describe('open a component as a system', () => {
  it('opening a component as a system creates boundary ports matching its ports one to one', () => {
    const { core, service } = orders()
    const before = modelState(core)
    const count = core.oplog.length
    const inner = core.dispatch({ type: 'component.openAsSystem', payload: { id: service } })
    assert.equal(core.oplog.length, count + 1, 'one undoable operation')
    assert.equal(core.node(service).innerSystemRef, inner)
    assert.equal(core.system(inner).ownerNodeId, service)
    assert.equal(core.system(inner).name, 'Orders')
    assert.deepEqual(boundary(core, inner), ['db:out', 'in:in', 'out:out'])
    for (const port of core.portsOf(service)) {
      const bp = core.boundaryPort(port.boundaryPortId)
      assert.equal(bp.systemId, inner, `${port.name} maps to a boundary port of the inner system`)
      assert.equal(bp.name, port.name)
    }
    assert.equal(
      core.tryDispatch({ type: 'component.openAsSystem', payload: { id: service } }).code,
      'E_SYSTEM_EXISTS',
      'a component has at most one inner system'
    )
    core.undo()
    assert.deepEqual(modelState(core), before)
  })

  it('adding a port to the owner adds a boundary port in the same batch', () => {
    const { core, service } = orders()
    const inner = core.dispatch({ type: 'component.openAsSystem', payload: { id: service } })
    const count = core.oplog.length
    const events = core.dispatch({
      type: 'port.add',
      payload: { nodeId: service, name: 'events', direction: 'out', accepts: ['async-message'] },
    })
    assert.equal(core.oplog.length, count + 1)
    assert.equal(core.boundaryPort(core.port(events).boundaryPortId).name, 'events')
    assert.deepEqual(boundary(core, inner), ['db:out', 'events:out', 'in:in', 'out:out'])

    core.dispatch({ type: 'port.update', payload: { id: events, changes: { name: 'published' } } })
    assert.deepEqual(boundary(core, inner), ['db:out', 'in:in', 'out:out', 'published:out'])
    core.dispatch({ type: 'port.remove', payload: { id: events } })
    assert.deepEqual(boundary(core, inner), ['db:out', 'in:in', 'out:out'])
    core.undo()
    core.undo()
    core.undo()
    assert.deepEqual(boundary(core, inner), ['db:out', 'in:in', 'out:out'], 'undo removes both')
    assert.equal(core.port(events), undefined)
  })

  it('the opened component keeps its typeRef and properties, and removing its inner system leaves it a black box only', () => {
    const { core, root, service } = orders()
    const inner = core.dispatch({ type: 'component.openAsSystem', payload: { id: service } })
    assert.equal(core.node(service).typeRef, 'test.service@1.0.0')
    assert.equal(core.effectiveProps(service).monthlyCost, 120)
    core.dispatch({ type: 'node.setProps', payload: { id: service, props: { monthlyCost: 150 } } })
    assert.equal(
      core.rollup(root, 'monthlyCost').value,
      150,
      'its own value, until inside says more'
    )

    core.dispatch({ type: 'component.removeInnerSystem', payload: { id: service } })
    const node = core.node(service)
    assert.deepEqual([node.innerSystemRef, node.placement], [null, null])
    assert.equal(core.system(inner), undefined)
    assert.deepEqual(
      core.portsOf(service).map(p => p.boundaryPortId ?? null),
      [null, null, null]
    )
    assert.deepEqual([node.typeRef, node.props.monthlyCost], ['test.service@1.0.0', 150])
    assert.equal(
      core.tryDispatch({ type: 'component.removeInnerSystem', payload: { id: service } }).code,
      'E_SYSTEM_NONE'
    )
  })
})
