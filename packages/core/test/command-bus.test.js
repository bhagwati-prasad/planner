import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CommandBus,
  Emitter,
  Store,
  StrataError,
  createUlidFactory,
  err,
  fail,
  ok,
} from '../src/index.js'
import { createRandom, gen, property } from '../../../tools/testing/index.js'
import { add, buildPayments, createTestCore, port, setup, T0 } from './helpers.js'
import { PAYLOADS } from './command-payloads.js'

/** A test command that renames a node, refusing blank names in `validate`. */
function registerRename(core) {
  core.register(
    'test.rename',
    (p, ctx) => {
      ctx.tx.update('node', p.id, { name: p.name })
    },
    { validate: p => (p.name.trim() ? ok() : err('INVALID', { id: p.id })) }
  )
}

describe('command bus', () => {
  it('a failing validate leaves state and rev unchanged and returns the error code', () => {
    const { core, root } = setup()
    const id = add(core, root, 'base:service', 'Orders')
    registerRename(core)
    const before = core.snapshot()
    const rev = core.rev
    const count = core.oplog.length
    const heard = []
    core.on('*', name => heard.push(name))

    const blank = { type: 'test.rename', payload: { id, name: ' ' } }
    assert.throws(
      () => core.dispatch(blank),
      e => e instanceof StrataError && e.code === 'INVALID' && e.details.id === id
    )
    assert.deepEqual(core.tryDispatch(blank), { ok: false, code: 'INVALID', details: { id } })
    const inBatch = {
      type: 'batch',
      payload: {
        commands: [
          { type: 'test.rename', payload: { id, name: 'Billing' } },
          { type: 'test.rename', payload: { id, name: '' } },
        ],
      },
    }
    assert.equal(core.tryDispatch(inBatch).code, 'INVALID', 'commands in a batch are validated too')

    assert.deepEqual(core.snapshot(), before)
    assert.equal(core.rev, rev)
    assert.equal(core.oplog.length, count)
    assert.deepEqual(heard, [], 'a refused command emits nothing')

    assert.deepEqual(core.tryDispatch({ type: 'test.rename', payload: { id, name: 'Billing' } }), {
      ok: true,
    })
    assert.equal(core.node(id).name, 'Billing')
  })

  it('a successful dispatch increments rev and emits events only after commit', () => {
    const { core, root } = setup()
    const id = add(core, root, 'base:service', 'Orders')
    const heard = []
    core.register('test.rename', (p, ctx) => {
      ctx.tx.update('node', p.id, { name: p.name })
      ctx.emit('test.renamed', { id: p.id, to: p.name })
      assert.deepEqual(heard, [], 'nothing is emitted while the command applies')
      if (p.explode) fail('INVALID', 'The command failed after emitting')
    })
    core.on('*', (name, data) =>
      heard.push({ name, rev: core.rev, seen: core.node(id).name, data })
    )
    const rev = core.rev

    core.dispatch({ type: 'test.rename', payload: { id, name: 'Billing' } })
    const op = core.oplog.at(-1)
    assert.equal(op.baseRev, rev, 'the operation records the revision it applied to')
    assert.equal(op.modelRev, rev + 1)
    assert.equal(core.rev, rev + 1)
    assert.deepEqual(
      heard.map(h => h.name),
      ['op', 'change', 'test.renamed', 'history']
    )
    for (const h of heard) {
      assert.equal(h.rev, rev + 1, `'${h.name}' is heard after the commit`)
      assert.equal(h.seen, 'Billing')
    }
    assert.deepEqual(heard[2].data, { id, to: 'Billing' })

    heard.length = 0
    assert.throws(
      () => core.dispatch({ type: 'test.rename', payload: { id, name: 'Lost', explode: true } }),
      /failed after emitting/
    )
    assert.deepEqual(heard, [], 'a command that fails after emitting emits nothing')
    assert.equal(core.rev, rev + 1)

    core.transaction(() => {
      core.dispatch({ type: 'test.rename', payload: { id, name: 'Payments' } })
      assert.throws(() =>
        core.dispatch({ type: 'test.rename', payload: { id, name: 'Lost', explode: true } })
      )
      core.dispatch({ type: 'test.rename', payload: { id, name: 'Settlement' } })
      assert.deepEqual(heard, [], 'a transaction emits when it commits')
    })
    assert.deepEqual(
      heard.map(h => [h.name, h.data?.to]),
      [
        ['op', undefined],
        ['change', undefined],
        ['test.renamed', 'Payments'],
        ['test.renamed', 'Settlement'],
        ['history', undefined],
      ],
      'events of a command rolled back inside the transaction are dropped'
    )
  })

  it('a handler that dispatches is queued, never re-entrant', () => {
    const { core, root } = setup()
    const id = add(core, root, 'base:service', 'Orders')
    const rename = name => ({ type: 'node.update', payload: { id, changes: { name } } })
    const seen = []
    core.on('change', () => {
      const name = core.node(id).name
      seen.push(['first', name, core.rev])
      if (name === 'Billing') {
        const rev = core.rev
        assert.equal(
          core.dispatch(rename('Payments')),
          undefined,
          'a queued command returns nothing yet'
        )
        assert.equal(core.node(id).name, 'Billing', 'the queued command has not run')
        assert.equal(core.rev, rev)
      }
    })
    core.on('change', () => seen.push(['second', core.node(id).name, core.rev]))
    const rev = core.rev

    core.dispatch(rename('Billing'))

    assert.deepEqual(seen, [
      ['first', 'Billing', rev + 1],
      ['second', 'Billing', rev + 1],
      ['first', 'Payments', rev + 2],
      ['second', 'Payments', rev + 2],
    ])
    assert.equal(core.node(id).name, 'Payments', 'the queued command ran after the events')
    const [billing, payments] = core.oplog.slice(-2)
    assert.equal(payments.baseRev, billing.modelRev)
  })

  it('runs queued commands first in, first out, including those queued while draining', () => {
    const { core, root } = setup()
    const id = add(core, root, 'base:service', 'A')
    const rename = name => ({ type: 'node.update', payload: { id, changes: { name } } })
    const next = { A1: ['B', 'C'], B: ['D'] }
    core.on('change', () => {
      for (const name of next[core.node(id).name] ?? []) core.dispatch(rename(name))
    })
    core.dispatch(rename('A1'))
    assert.deepEqual(
      core.oplog.slice(-4).map(op => op.payload.changes.name),
      ['A1', 'B', 'C', 'D']
    )
  })

  it('queues transactions, undo and redo started from an event listener', () => {
    const { core, root } = setup()
    const id = add(core, root, 'base:service', 'A')
    const rename = name => ({ type: 'node.update', payload: { id, changes: { name } } })
    const order = []
    const off = core.on('change', () => {
      off()
      core.transaction(() => core.dispatch(rename('C')))
      order.push(core.node(id).name)
      core.undo()
      order.push(core.node(id).name)
    })
    core.dispatch(rename('B'))
    assert.deepEqual(order, ['B', 'B'], 'nothing ran inside the listener')
    assert.equal(core.node(id).name, 'B', 'the transaction ran, then undo reverted it')
    assert.equal(core.oplog.at(-2).command, 'batch')
  })

  it('reports a queued command that fails to the error handler and keeps the command before it', () => {
    const errors = []
    const store = new Store()
    const emitter = new Emitter({ onError: e => errors.push(e) })
    const random = createRandom(1)
    const bus = new CommandBus({
      store,
      emitter,
      newId: createUlidFactory({ now: () => T0, random: n => random.bytes(n) }),
      clock: () => T0,
      actorId: 'tester',
    })
    bus.register('test.create', (p, ctx) => {
      ctx.tx.create('view', { id: p.id })
    })
    emitter.on('change', () => bus.dispatch({ type: 'test.create', payload: { id: 'v1' } }))
    bus.dispatch({ type: 'test.create', payload: { id: 'v1' } })
    assert.equal(store.count('view'), 1)
    assert.equal(store.rev, 1)
    assert.deepEqual(
      errors.map(e => e.code),
      ['CONFLICT']
    )
  })

  it('payloads containing undefined, Date, Map or functions fail with E_COMMAND_PAYLOAD', () => {
    const { core, root } = setup()
    const before = core.snapshot()
    const values = {
      undefined,
      Date: new Date(T0),
      Map: new Map(),
      function: () => 1,
      'class instance': new (class Point {})(),
      bigint: 1n,
      Infinity,
    }
    for (const [label, value] of Object.entries(values)) {
      for (const [where, payload, path] of [
        ['a property', { description: value }, 'component.add payload.description'],
        ['a nested object', { props: { maxRps: value } }, 'component.add payload.props.maxRps'],
        ['a list', { tags: ['a', value] }, 'component.add payload.tags[1]'],
      ]) {
        const command = {
          type: 'component.add',
          payload: { systemId: root, typeRef: 'test.service', name: 'X', ...payload },
        }
        assert.throws(
          () => core.dispatch(command),
          e => e.code === 'E_COMMAND_PAYLOAD' && e.details.path === path,
          `${label} in ${where}`
        )
        assert.deepEqual(core.tryDispatch(command), {
          ok: false,
          code: 'E_COMMAND_PAYLOAD',
          details: { path },
        })
      }
    }
    assert.deepEqual(core.snapshot(), before)
  })

  it('property: apply then inverse restores state for every registered command, ignoring audit fields', () => {
    const types = createTestCore()
      .commands()
      .map(c => c.type)
    assert.deepEqual(
      types.filter(type => !(type in PAYLOADS)),
      [],
      'every registered command needs a payload generator in test/command-payloads.js'
    )
    const applied = new Map(types.map(type => [type, 0]))

    property(
      [gen.bool(), gen.array(gen.int(0, 2 ** 31 - 1), { min: 1, max: 40 })],
      (payments, steps) => {
        const core = payments ? paymentsWithLibrary() : createTestCore()
        for (const step of steps) {
          // One of the commands the model has something to apply to, chosen uniformly.
          const random = createRandom(step)
          const before = core.snapshot()
          const choices = types
            .map(type => ({ type, payload: PAYLOADS[type](before, random) }))
            .filter(choice => choice.payload)
          const { type, payload } = choices[random.uint32() % choices.length]
          const count = core.oplog.length
          try {
            core.dispatch({ type, payload })
          } catch (e) {
            if (!(e instanceof StrataError)) throw e
            assert.deepEqual(core.snapshot(), before, `a refused ${type} changes nothing`)
            continue
          }
          if (core.oplog.length === count) {
            assert.deepEqual(core.snapshot(), before, `a ${type} that logs nothing changes nothing`)
            continue
          }
          const after = auditFree(core.snapshot())
          core.dispatch(core.oplog.at(-1).inverse)
          assert.deepEqual(
            auditFree(core.snapshot()),
            auditFree(before),
            `${type}, then its inverse`
          )
          core.dispatch(core.oplog.at(-1).inverse)
          assert.deepEqual(
            auditFree(core.snapshot()),
            after,
            `${type}, its inverse, then that one's`
          )
          applied.set(type, (applied.get(type) ?? 0) + 1)
        }
      },
      { runs: 100 }
    )
    assert.deepEqual(
      [...applied].filter(([, n]) => n === 0).map(([type]) => type),
      [],
      'every registered command was applied at least once'
    )
  })
})

/**
 * The payments example plus a library system placed by reference, so every command has
 * something to apply to from the first step.
 */
function paymentsWithLibrary() {
  const { core, root } = setup()
  buildPayments(core, root)
  const library = core.dispatch({ type: 'system.create', payload: { name: 'Library' } })
  // A service behind the library's boundary port, with its method bound (ADR 0010).
  const worker = add(core, library, 'test.service', 'Worker')
  const bp = core.dispatch({
    type: 'boundary.add',
    payload: {
      systemId: library,
      name: 'in',
      direction: 'in',
      internalPortId: port(core, worker, 'in'),
    },
  })
  core.dispatch({
    type: 'boundary.bind',
    payload: { boundaryPortId: bp, method: 'handle', nodeId: worker, target: 'handle' },
  })
  core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: library } })
  return core
}

const AUDIT_FIELDS = ['createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'rev']

/** A snapshot without the model revision and each entity's audit fields. */
function auditFree(snapshot) {
  const strip = entity => {
    const out = { ...entity }
    for (const field of AUDIT_FIELDS) delete out[field]
    return out
  }
  const { rev: _rev, ...rest } = snapshot
  return Object.fromEntries(
    Object.entries(rest).map(([table, value]) => [
      table,
      Array.isArray(value)
        ? value.map(strip)
        : value && typeof value === 'object'
          ? strip(value)
          : value,
    ])
  )
}
