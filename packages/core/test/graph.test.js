import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { add, connect, modelState, port, setup } from './helpers.js'

/** A client, two services and a database in the root system. */
function graph() {
  const { core, root } = setup()
  const client = add(core, root, 'base:client', 'Web client')
  const orders = add(core, root, 'test.service', 'Orders')
  const billing = add(core, root, 'test.service', 'Billing')
  const db = add(core, root, 'test.db', 'Ledger')
  return { core, root, client, orders, billing, db }
}

/** @param {import('../src/index.js').Core} core @param {string} from @param {string} to */
const edge = (core, from, to) =>
  core.tryDispatch({ type: 'edge.add', payload: { fromPort: from, toPort: to } })

describe('graph invariants', () => {
  it('an edge starting at an input-only port fails with E_EDGE_DIRECTION', () => {
    const { core, orders, billing } = graph()
    const before = core.snapshot()
    const result = edge(core, port(core, orders, 'in'), port(core, billing, 'in'))
    assert.equal(result.code, 'E_EDGE_DIRECTION')
    assert.equal(
      edge(core, port(core, orders, 'out'), port(core, billing, 'out')).code,
      'E_EDGE_DIRECTION',
      'or ending at an output-only one'
    )
    assert.deepEqual(core.snapshot(), before)
  })

  it('a self-loop fails with E_EDGE_SELF_LOOP', () => {
    const { core, orders } = graph()
    assert.equal(
      edge(core, port(core, orders, 'out'), port(core, orders, 'in')).code,
      'E_EDGE_SELF_LOOP'
    )
    assert.equal(
      edge(core, port(core, orders, 'out'), port(core, orders, 'out')).code,
      'E_EDGE_SELF_LOOP',
      'a port to itself too'
    )
    assert.equal(core.edgesOf(core.rootSystemId).length, 0)
  })

  it('parallel edges between the same two components are allowed', () => {
    const { core, orders, billing } = graph()
    core.dispatch({
      type: 'port.add',
      payload: { nodeId: billing, name: 'events', direction: 'in', accepts: ['grpc'] },
    })
    const http = connect(core, orders, 'out', billing, 'in', { connectionType: 'http' })
    const grpc = connect(core, orders, 'out', billing, 'events', { connectionType: 'grpc' })
    const again = connect(core, orders, 'out', billing, 'in', { connectionType: 'http' })
    assert.equal(new Set([http, grpc, again]).size, 3)
    assert.equal(core.edgesOf(core.rootSystemId).length, 3)
  })

  it('an edge between components in different systems fails with E_EDGE_CROSS_LEVEL', () => {
    const { core, root, orders, db } = graph()
    const { systemId: inner } = core.dispatch({
      type: 'system.extract',
      payload: { systemId: root, nodeIds: [db], name: 'Storage' },
    })
    assert.ok(inner)
    assert.equal(
      edge(core, port(core, orders, 'db'), port(core, db, 'in')).code,
      'E_EDGE_CROSS_LEVEL'
    )
  })

  it('removing a component removes its edges in the same batch, and undo restores both', () => {
    const { core, client, orders, db } = graph()
    connect(core, client, 'out', orders, 'in')
    connect(core, orders, 'db', db, 'in')
    const before = modelState(core)
    const count = core.oplog.length
    core.dispatch({ type: 'node.remove', payload: { id: orders } })
    assert.equal(core.oplog.length, count + 1, 'one operation')
    assert.equal(core.node(orders), undefined)
    assert.deepEqual(core.edgesOf(core.rootSystemId), [], 'no edge is left dangling')
    core.undo()
    assert.deepEqual(modelState(core), before, 'one undo restores the component and both edges')
  })
})
