import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { add, buildPayments, modelState, setup } from './helpers.js'

/** Five commands that need no ids from each other: two components, then changes to them. */
function fiveCommands(root) {
  return [
    { type: 'component.add', payload: { systemId: root, typeRef: 'base:service', id: 'n-a' } },
    { type: 'component.add', payload: { systemId: root, typeRef: 'test.db', id: 'n-b' } },
    { type: 'node.update', payload: { id: 'n-a', changes: { name: 'Orders', owner: 'team-a' } } },
    { type: 'node.setProps', payload: { id: 'n-b', props: { storageGb: 500 } } },
    { type: 'system.create', payload: { name: 'Library', id: 's-lib' } },
  ]
}

describe('undo, redo and batches', () => {
  it('a batch of five commands undoes in one step', () => {
    for (const via of ['batch command', 'transaction']) {
      const { core, root } = setup()
      add(core, root, 'base:client', 'Web client')
      const before = modelState(core)
      const count = core.oplog.length
      const commands = fiveCommands(root)

      if (via === 'batch command') core.dispatch({ type: 'batch', payload: { commands } })
      else core.transaction(() => commands.forEach(command => core.dispatch(command)))
      const after = modelState(core)
      assert.equal(core.oplog.length, count + 1, `${via}: five commands are one operation`)
      assert.equal(core.oplog.at(-1).command, 'batch')
      assert.equal(core.node('n-a').name, 'Orders')

      core.undo()
      assert.deepEqual(modelState(core), before, `${via}: one undo reverts all five`)
      assert.equal(core.canUndo, true, `${via}: the command before the batch is still undoable`)
      core.redo()
      assert.deepEqual(modelState(core), after, `${via}: one redo reapplies all five`)
    }
  })

  it('a batch whose third command fails leaves state unchanged', () => {
    for (const via of ['batch command', 'transaction']) {
      const { core, root } = setup()
      const client = add(core, root, 'base:client', 'Web client')
      const before = core.snapshot()
      const count = core.oplog.length
      const heard = []
      core.on('*', name => heard.push(name))
      const commands = fiveCommands(root)
      commands[2] = { type: 'node.update', payload: { id: 'missing', changes: { name: 'X' } } }

      assert.throws(
        () =>
          via === 'batch command'
            ? core.dispatch({ type: 'batch', payload: { commands } })
            : core.transaction(() => commands.forEach(command => core.dispatch(command))),
        err => err.code === 'NOT_FOUND',
        via
      )
      assert.deepEqual(core.snapshot(), before, `${via}: the first two commands are rolled back`)
      assert.equal(core.oplog.length, count, `${via}: nothing is logged`)
      assert.deepEqual(heard, [], `${via}: nothing is emitted`)
      core.undo()
      assert.equal(core.node(client), undefined, `${via}: undo still reverts the command before`)
    }
  })

  it('redo reapplies identically; a new command clears the redo stack', () => {
    const { core, root } = setup()
    const { service, ledger, queue } = buildPayments(core, root)
    const states = [modelState(core)]
    core.dispatch({
      type: 'system.extract',
      payload: { systemId: root, nodeIds: [service, ledger, queue], name: 'Payments' },
    })
    states.push(modelState(core))
    core.dispatch({ type: 'node.update', payload: { id: service, changes: { owner: 'team-p' } } })
    states.push(modelState(core))
    core.dispatch({ type: 'batch', payload: { commands: fiveCommands(root) } })
    states.push(modelState(core))

    for (let i = states.length - 2; i >= 0; i--) {
      core.undo()
      assert.deepEqual(modelState(core), states[i], `undo back to state ${i}`)
    }
    for (let i = 1; i < states.length; i++) {
      core.redo()
      assert.deepEqual(modelState(core), states[i], `redo forward to state ${i}`)
    }
    assert.equal(core.redo(), null, 'nothing is left to redo')

    core.undo()
    core.undo()
    assert.equal(core.canRedo, true)
    add(core, root, 'base:store', 'Cache')
    assert.equal(core.canRedo, false, 'a new command clears the redo stack')
    assert.equal(core.redo(), null)
    core.undo()
    assert.deepEqual(modelState(core), states[1], 'undo continues from before the new command')
  })
})
