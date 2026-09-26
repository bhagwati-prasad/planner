import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCore, isUlid } from '../src/index.js'
import {
  setup,
  add,
  connect,
  createTestCore,
  testRegistry,
  modelState,
  buildPayments,
} from './helpers.js'

test('each command becomes one operation with the fields the spec lists', () => {
  const { core, root } = setup()
  const id = add(core, root, 'base:service', 'Orders')
  const op = core.oplog.at(-1)
  assert.equal(op.command, 'component.add')
  assert.ok(isUlid(op.id))
  assert.equal(op.actorId, 'tester')
  assert.equal(op.timestamp, '2026-09-25T09:00:00.000Z')
  assert.equal(op.modelRev, core.rev)
  assert.equal(op.inverse.type, 'model.restore')
  assert.deepEqual(op.ids.slice(0, 1), [id])
  assert.equal(op.payload.typeRef, 'base:service@1.0.0', 'the logged payload pins the type version')
  assert.deepEqual(
    op.payload.ports.map(p => p.name),
    ['in', 'out']
  )
  assert.ok(Object.isFrozen(op))
})

test('commands must be serialisable and known', () => {
  const { core, root } = setup()
  assert.throws(
    () =>
      core.dispatch({
        type: 'component.add',
        payload: { systemId: root, typeRef: 'service', props: { f: () => 1 } },
      }),
    /not serialisable/
  )
  assert.throws(
    () => core.dispatch({ type: 'component.ad', payload: {} }),
    err => err.code === 'UNKNOWN_COMMAND' && /Did you mean 'component.add'/.test(err.message)
  )
  assert.throws(() => core.dispatch('component.add'), /must be an object/)
  assert.throws(
    () => core.dispatch({ type: 'component.add', payload: [1] }),
    /payload must be an object/
  )
})

test('a failing command changes nothing and logs nothing', () => {
  const { core, root } = setup()
  add(core, root, 'base:service', 'A')
  const before = core.snapshot()
  const count = core.oplog.length
  assert.throws(
    () =>
      core.dispatch({
        type: 'component.add',
        payload: { systemId: root, typeRef: 'test.service', props: { maxRps: 'fast' } },
      }),
    /must be a number/
  )
  assert.deepEqual(core.snapshot(), before)
  assert.equal(core.oplog.length, count)
})

test('a command that changes nothing is not logged', () => {
  const { core, root } = setup()
  const id = add(core, root, 'base:service', 'A')
  const count = core.oplog.length
  assert.equal(
    core.dispatch({ type: 'node.update', payload: { id, changes: { name: 'A' } } }),
    undefined
  )
  assert.equal(core.oplog.length, count)
})

test('undo and redo walk back and forth through history', () => {
  const { core, root } = setup()
  const s0 = modelState(core)
  assert.equal(core.canUndo, false, 'project.init is not undoable')
  const a = add(core, root, 'base:service', 'A')
  const s1 = modelState(core)
  core.dispatch({
    type: 'node.update',
    payload: { id: a, changes: { name: 'A2', owner: 'team-a' } },
  })
  const s2 = modelState(core)
  core.undo()
  assert.deepEqual(modelState(core), s1)
  core.undo()
  assert.deepEqual(modelState(core), s0)
  assert.equal(core.undo(), null)
  core.redo()
  assert.deepEqual(modelState(core), s1)
  core.redo()
  assert.deepEqual(modelState(core), s2)
  assert.equal(core.redo(), null)
  core.undo()
  add(core, root, 'base:store', 'B')
  assert.equal(core.canRedo, false, 'a new command clears redo')
  const kinds = core.oplog.map(o => (o.meta ? Object.keys(o.meta)[0] : o.command))
  assert.deepEqual(kinds, [
    'project.init',
    'component.add',
    'node.update',
    'undoOf',
    'undoOf',
    'redoOf',
    'redoOf',
    'undoOf',
    'component.add',
  ])
})

test('entity revisions keep increasing through undo and redo', () => {
  const { core, root } = setup()
  const a = add(core, root, 'base:service', 'A')
  core.dispatch({ type: 'node.update', payload: { id: a, changes: { name: 'B' } } })
  assert.equal(core.node(a).rev, 2)
  core.undo()
  assert.equal(core.node(a).name, 'A')
  assert.equal(core.node(a).rev, 3)
  core.redo()
  assert.equal(core.node(a).rev, 4)
})

test('transactions commit many commands as one undoable batch', () => {
  const { core, root } = setup()
  const before = modelState(core)
  const ids = core.transaction(
    () => {
      const a = add(core, root, 'base:client', 'Client')
      const b = add(core, root, 'base:service', 'Service')
      connect(core, a, 'out', b, 'in')
      return [a, b]
    },
    { label: 'Add client and service' }
  )
  const op = core.oplog.at(-1)
  assert.equal(op.command, 'batch')
  assert.equal(op.payload.label, 'Add client and service')
  assert.deepEqual(
    op.payload.commands.map(c => c.type),
    ['component.add', 'component.add', 'edge.add']
  )
  assert.equal(core.nodesOf(root).length, 2)
  core.undo()
  assert.deepEqual(modelState(core), before)
  assert.equal(core.node(ids[0]), undefined)
})

test('a throwing transaction applies nothing; a caught failure inside keeps the rest', () => {
  const { core, root } = setup()
  const before = core.snapshot()
  assert.throws(
    () =>
      core.transaction(() => {
        add(core, root, 'base:service', 'A')
        throw new Error('stop')
      }),
    /stop/
  )
  assert.deepEqual(core.snapshot(), before)

  core.transaction(() => {
    add(core, root, 'base:service', 'Kept')
    assert.throws(() => add(core, root, 'test.service', 'Bad', { props: { maxRps: -'x' } }))
    core.transaction(() => add(core, root, 'base:store', 'Nested'))
  })
  assert.deepEqual(
    core.nodesOf(root).map(n => n.name),
    ['Kept', 'Nested']
  )
  assert.deepEqual(
    core.oplog.at(-1).payload.commands.map(c => c.payload.name),
    ['Kept', 'Nested']
  )
  assert.throws(() => core.transaction(async () => {}), /synchronous/)
  assert.equal(core.inTransaction, false)
})

test('undo is refused inside a transaction', () => {
  const { core } = setup()
  assert.throws(() => core.transaction(() => core.undo()), /inside a transaction/)
})

test('replaying the op log on another machine rebuilds the identical model', () => {
  const { core, root } = setup()
  const { service, ledger, queue } = buildPayments(core, root)
  core.dispatch({
    type: 'system.extract',
    payload: { systemId: root, nodeIds: [service, ledger, queue], name: 'Payments' },
  })
  core.transaction(() => add(core, root, 'base:timer', 'Nightly'))
  core.undo()
  core.redo()
  core.undo()

  const other = createCore({ registry: testRegistry(), clock: () => 0 })
  const shipped = JSON.parse(JSON.stringify(core.oplog))
  other.replay(shipped)
  assert.deepEqual(other.snapshot(), core.snapshot())
  assert.deepEqual(
    other.oplog.map(o => o.id),
    core.oplog.map(o => o.id)
  )
})

test('replay needs no registry: logged payloads carry resolved types and ports', () => {
  const { core, root } = setup()
  buildPayments(core, root)
  const bare = createCore({ registry: testRegistry() })
  const noComponents = createCore()
  bare.replay(core.oplog)
  noComponents.replay(core.oplog)
  assert.deepEqual(noComponents.snapshot(), core.snapshot())
  assert.ok(noComponents.problems().some(p => p.code === 'MISSING_COMPONENT'))
})

test('replay detects divergence', () => {
  const { core, root } = setup()
  add(core, root, 'base:service', 'A')
  const tampered = core.oplog.map(op =>
    op.command === 'component.add' ? { ...op, ids: op.ids.slice(1) } : op
  )
  const other = createTestCore()
  assert.throws(
    () => other.replay(tampered),
    err => err.code === 'CONFLICT'
  )
})

test('events report operations, net changes and history state', () => {
  const { core, root } = setup()
  const seen = []
  core.on('change', ({ op, changes }) =>
    seen.push([op.command, changes.map(c => `${c.action}:${c.kind}`)])
  )
  core.on('history', h => seen.push(['history', h.canUndo, h.canRedo]))
  const id = add(core, root, 'base:service', 'A')
  core.dispatch({ type: 'node.remove', payload: { id } })
  core.undo()
  assert.deepEqual(seen, [
    ['component.add', ['update:project', 'create:node', 'create:port', 'create:port']],
    ['history', true, false],
    ['node.remove', ['delete:port', 'delete:port', 'delete:node']],
    ['history', true, false],
    ['model.restore', ['create:port', 'create:port', 'create:node']],
    ['history', true, true],
  ])
})

test('plugins register commands through the same API', () => {
  const { core, root } = setup()
  core.register(
    'acme.tagAll',
    (payload, ctx) => {
      for (const node of ctx.tx.find('node', 'systemId', payload.systemId)) {
        ctx.tx.update('node', node.id, { tags: [...node.tags, payload.tag] })
      }
    },
    { description: 'Tags every node in a system' }
  )
  add(core, root, 'base:service', 'A')
  add(core, root, 'base:store', 'B')
  core.dispatch({ type: 'acme.tagAll', payload: { systemId: root, tag: 'pci' } })
  assert.deepEqual(
    core.nodesOf(root).map(n => n.tags),
    [['pci'], ['pci']]
  )
  core.undo()
  assert.deepEqual(
    core.nodesOf(root).map(n => n.tags),
    [[], []]
  )
  assert.ok(core.commands().some(c => c.type === 'acme.tagAll'))
  assert.throws(() => core.register('acme.tagAll', () => {}), /already registered/)
  assert.throws(() => core.register('notnamespaced', () => {}), /namespaced/)
})
