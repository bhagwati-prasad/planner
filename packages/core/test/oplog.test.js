import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson, ok } from '../src/index.js'
import { add, buildPayments, createTestCore, testClock, T0 } from './helpers.js'

/** A project built from an empty core with most kinds of operation: commands, a batch, undo and redo. */
function history() {
  const core = createTestCore()
  const { rootSystemId: root } = core.dispatch({
    type: 'project.init',
    payload: { name: 'Checkout' },
  })
  const { service, ledger, queue } = buildPayments(core, root)
  core.dispatch({
    type: 'system.extract',
    payload: { systemId: root, nodeIds: [service, ledger, queue], name: 'Payments' },
  })
  core.transaction(() => {
    add(core, root, 'base:timer', 'Nightly')
    add(core, root, 'base:store', 'Archive')
  })
  core.dispatch({ type: 'node.update', payload: { id: service, changes: { owner: 'team-p' } } })
  core.undo()
  core.undo()
  core.redo()
  return core
}

/** A copy of plain data with every object's keys in reverse order, as another store might return it. */
function reversed(value) {
  if (Array.isArray(value)) return value.map(reversed)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .reverse()
        .map(key => [key, reversed(value[key])])
    )
  return value
}

describe('operation log', () => {
  it('replaying the op log from an empty project reproduces the same state hash', () => {
    const core = history()
    const hash = core.stateHash()
    assert.match(hash, /^[0-9a-f]{64}$/)

    const replica = createTestCore({ seed: 99, clock: testClock(T0 + 3_600_000) })
    replica.replay(JSON.parse(JSON.stringify(core.oplog)))
    assert.equal(replica.stateHash(), hash)

    replica.dispatch({ type: 'project.update', payload: { changes: { name: 'Other' } } })
    assert.notEqual(replica.stateHash(), hash, 'a change changes the hash')
  })

  it('a version-1 payload is upgraded to version 2 during replay', () => {
    const rename = (p, ctx) => {
      ctx.tx.update('node', p.id, { name: p.label ?? p.name })
    }
    const v1 = createTestCore()
    v1.dispatch({ type: 'project.init', payload: { name: 'Checkout' } })
    v1.register('test.rename', rename)
    const id = add(v1, v1.rootSystemId, 'base:service', 'Orders')
    v1.dispatch({ type: 'test.rename', payload: { id, name: 'Billing' } })
    v1.transaction(() => v1.dispatch({ type: 'test.rename', payload: { id, name: 'Ledger' } }))
    const log = JSON.parse(JSON.stringify(v1.oplog))
    assert.equal(log.at(-2).version, 1, 'operations record the version of their command')
    assert.equal(log.at(-1).payload.commands[0].version, 1, 'and so do commands in a batch')

    const seen = []
    const v2 = createTestCore()
    v2.register(
      'test.rename',
      (p, ctx) => {
        seen.push(p)
        rename(p, ctx)
      },
      {
        version: 2,
        upgrades: { 1: ({ id: nodeId, name }) => ({ id: nodeId, label: name }) },
        validate: p => (typeof p.label === 'string' ? ok() : assert.fail('not upgraded')),
      }
    )
    v2.replay(log)
    assert.deepEqual(seen, [
      { id, label: 'Billing' },
      { id, label: 'Ledger' },
    ])
    assert.equal(v2.node(id).name, 'Ledger')
    assert.equal(v2.stateHash(), v1.stateHash())
    const [single, batch] = v2.oplog.slice(-2)
    assert.equal(single.version, 2, 'the replayed operation is recorded at the new version')
    assert.deepEqual(single.payload, { id, label: 'Billing' })
    assert.deepEqual(batch.payload.commands[0], {
      type: 'test.rename',
      version: 2,
      payload: { id, label: 'Ledger' },
    })

    const newer = { ...log.at(-2), version: 3 }
    const older = createTestCore()
    older.register('test.rename', rename)
    assert.throws(
      () => older.replay([...log.slice(0, -2), newer]),
      err => err.code === 'E_COMMAND_VERSION',
      'an operation newer than the registered command is refused'
    )
    assert.throws(
      () => createTestCore().register('test.rename', rename, { version: 2 }),
      err => err.code === 'E_COMMAND_VERSION',
      'every version below the current one needs an upgrader'
    )
  })

  it('op log entries are JSON-safe and serialise with stable key order', () => {
    const core = history()
    const text = JSON.stringify(core.oplog)
    assert.deepEqual(JSON.parse(text), core.oplog, 'JSON carries every entry unchanged')
    for (const op of core.oplog)
      assert.equal(JSON.stringify(op), canonicalJson(op), `${op.command}: keys are in sorted order`)

    const replica = createTestCore({ seed: 7 })
    replica.replay(reversed(JSON.parse(text)))
    assert.equal(
      JSON.stringify(replica.oplog),
      text,
      'replaying entries whose keys arrive in another order logs the same text'
    )
  })
})
