import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCore } from '../src/index.js'
import { setup, add, port, buildPayments, testRegistry } from './helpers.js'

test('a well-formed model has no problems', () => {
  const { core, root } = setup()
  buildPayments(core, root)
  assert.deepEqual(core.problems(), [])
})

test('problems cover placeholders, unmapped ports, unused library systems and bad data from files', () => {
  const { core, root } = setup()
  const svc = add(core, root, 'test.service', 'Svc', { props: { maxRps: 10 } })
  add(core, root, 'acme.gone@1.0.0', 'Ghost', { ports: [] })
  core.dispatch({ type: 'boundary.add', payload: { systemId: root, name: 'api', direction: 'in' } })
  core.dispatch({ type: 'system.create', payload: { name: 'Spare' } })

  // Data edited outside the command bus (e.g. a hand-edited file) is still checked.
  const snap = core.snapshot()
  const node = snap.nodes.find(n => n.id === svc)
  node.props = { maxRps: 'lots', mystery: 1 }
  const edge = {
    id: 'e-broken',
    systemId: root,
    fromPort: port(core, svc, 'out'),
    toPort: 'missing',
    connectionType: null,
    props: {},
    label: '',
    createdBy: 'x',
    createdAt: 'x',
    updatedBy: 'x',
    updatedAt: 'x',
    rev: 1,
  }
  snap.edges.push(edge)
  const loaded = createCore({ registry: testRegistry(), snapshot: snap })

  const codes = loaded.problems().map(p => `${p.severity}:${p.code}`)
  assert.deepEqual(codes, [
    'error:BROKEN_EDGE',
    'error:INVALID_PROPERTY',
    'warning:MISSING_COMPONENT',
    'warning:UNKNOWN_PROPERTY',
    'warning:UNMAPPED_BOUNDARY_PORT',
    'info:UNUSED_SYSTEM',
  ])
  const invalid = loaded.problems().find(p => p.code === 'INVALID_PROPERTY')
  assert.equal(invalid.id, svc)
  assert.equal(invalid.systemId, root)
  assert.match(invalid.message, /Svc.maxRps must be a number/)
})

test('a model loaded without its components still opens, with warnings', () => {
  const { core, root } = setup()
  buildPayments(core, root)
  const bare = createCore({ snapshot: core.snapshot() })
  const missing = bare.problems().filter(p => p.code === 'MISSING_COMPONENT')
  assert.equal(missing.length, 3, 'test.service, test.db and acme.message-queue are not installed')
  assert.equal(bare.nodes().length, 6)
})
