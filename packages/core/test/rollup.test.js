import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, add, connect, buildPayments } from './helpers.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`)

/** A → B → D and A → C → D, with service times 10, 20, 50 and 5 ms. */
function diamond(core, systemId) {
  const svc = (name, ms, maxRps) =>
    add(core, systemId, 'test.service', name, { props: { serviceTime: ms, maxRps } })
  const a = svc('A', 10, 900)
  const b = svc('B', 20, 400)
  const c = svc('C', 50, 700)
  const d = add(core, systemId, 'test.db', 'D', { props: { serviceTime: 5, maxRps: 3000 } })
  connect(core, a, 'out', b, 'in', { connectionType: 'http' })
  connect(core, a, 'out', c, 'in', { connectionType: 'http' })
  connect(core, b, 'db', d, 'in')
  connect(core, c, 'db', d, 'in')
  return { a, b, c, d }
}

test('critical-path takes the slowest path and reports it', () => {
  const { core, root } = setup()
  const { a, c, d } = diamond(core, root)
  const r = core.rollup(root, 'serviceTime.p99')
  assert.equal(r.rule, 'critical-path')
  assert.equal(r.value, 65)
  assert.deepEqual(r.path, [a, c, d])
  assert.equal(r.unit, 'ms')
})

test('min-path finds the bottleneck', () => {
  const { core, root } = setup()
  const { b } = diamond(core, root)
  const r = core.rollup(root, 'maxRps')
  assert.equal(r.rule, 'min-path')
  assert.equal(r.value, 400)
  assert.equal(r.bottleneck, b)
})

test('product multiplies availability along paths; the worst path wins', () => {
  const { core, root } = setup()
  const { a, b, c, d } = diamond(core, root)
  core.dispatch({ type: 'node.setProps', payload: { id: b, props: { availabilityTarget: 99 } } })
  const r = core.rollup(root, 'availabilityTarget')
  assert.equal(r.rule, 'product')
  close(r.value, 99.9 * 0.99 * 0.999)
  assert.deepEqual(r.path, [a, b, d])
  void c
})

test('sum, union and count aggregate through nested composites', () => {
  const { core, root } = setup()
  const m = buildPayments(core, root)
  core.dispatch({
    type: 'node.setProps',
    payload: { id: m.service, props: { monthlyCost: 120, instances: 3, technology: 'Node.js 20' } },
  })
  core.dispatch({
    type: 'node.setProps',
    payload: { id: m.ledger, props: { monthlyCost: 300, technology: 'PostgreSQL 16' } },
  })
  const { systemId } = core.dispatch({
    type: 'system.extract',
    payload: { systemId: root, nodeIds: [m.service, m.ledger], name: 'Core' },
  })
  core.dispatch({
    type: 'system.extract',
    payload: { systemId, nodeIds: [m.ledger], name: 'Storage' },
  })

  assert.equal(core.rollup(root, 'monthlyCost').value, 420)
  assert.equal(
    core.rollup(root, 'instances').value,
    8,
    '3 service instances + 5 others with the default of 1'
  )
  assert.equal(core.rollup(systemId, 'instances').value, 4)
  assert.deepEqual(core.rollup(root, 'technology').value, ['Node.js 20', 'PostgreSQL 16'])
  assert.equal(core.rollup(root, 'storageGb').value, 100)

  core.dispatch({ type: 'node.update', payload: { id: m.ledger, changes: { status: 'existing' } } })
  const planned = core.rollup(root, 'plannedCount', {
    rule: { rule: 'count', where: { status: 'planned' } },
  })
  assert.equal(planned.value, 5)
  assert.equal(
    core.rollup(root, 'queues', { rule: { rule: 'count', where: { extends: 'base:queue' } } })
      .value,
    1
  )
})

test('worst ranks states; a value source (e.g. simulation metrics) takes precedence over properties', () => {
  const { core, root } = setup()
  const { a, b, c } = diamond(core, root)
  const health = { [a]: 'up', [b]: 'degraded', [c]: 'up' }
  const r = core.rollup(root, 'health', {
    values: (node, key) => (key === 'health' ? health[node.id] : undefined),
  })
  assert.equal(r.value, 'degraded')
  assert.equal(r.missing.length, 1, 'D has no health value')
  const latency = { [a]: 1, [b]: 1, [c]: 1 }
  assert.equal(
    core.rollup(root, 'serviceTime.p99', { values: node => latency[node.id] }).value,
    7,
    'D falls back to its property (5 ms)'
  )
})

test('paths run from the in boundary port to the out boundary port', () => {
  const { core, root } = setup()
  const m = buildPayments(core, root)
  const { systemId } = core.dispatch({
    type: 'system.extract',
    payload: {
      systemId: root,
      nodeIds: [m.gateway, m.service, m.ledger, m.queue],
      name: 'Payments',
    },
  })
  const r = core.rollup(systemId, 'serviceTime.p99', { rule: 'critical-path' })
  // Gateway (base:proxy) has no service time; the ledger branch does not reach the out port.
  assert.deepEqual(r.path, [m.gateway, m.service, m.queue])
  assert.equal(r.value, 10)
  assert.deepEqual(r.sources, [m.gateway])
  assert.deepEqual(r.targets, [m.queue])
})

test('cycles are broken at back edges', () => {
  const { core, root } = setup()
  const a = add(core, root, 'test.service', 'A', { props: { serviceTime: 1 } })
  const b = add(core, root, 'test.service', 'B', { props: { serviceTime: 2 } })
  const client = add(core, root, 'base:client', 'Client')
  connect(core, client, 'out', a, 'in', { connectionType: 'http' })
  connect(core, a, 'out', b, 'in', { connectionType: 'http' })
  connect(core, b, 'out', a, 'in', { connectionType: 'http' })
  assert.equal(core.rollup(root, 'serviceTime.p99').value, 3)
})

test('systems can override the rule for their own subtree', () => {
  const { core, root } = setup()
  diamond(core, root)
  core.dispatch({
    type: 'system.update',
    payload: { id: root, changes: { rollups: { 'serviceTime.p99': 'max' } } },
  })
  assert.equal(core.rollup(root, 'serviceTime.p99').value, 50)
  assert.equal(
    core.rollup(root, 'serviceTime.p99', { rule: 'sum' }).value,
    85,
    'an explicit rule wins'
  )
})

test('a missing rule is a clear error', () => {
  const { core, root } = setup()
  add(core, root, 'test.service', 'A')
  assert.throws(
    () => core.rollup(root, 'timeout'),
    err => err.code === 'NO_ROLLUP_RULE' && /rollups\['timeout'\]/.test(err.message)
  )
  assert.equal(
    core.rollup(root, 'timeout', { rule: 'max' }).value,
    2000,
    'durations roll up in milliseconds'
  )
})

test('contracts: violations become problems, and abstract systems use their contract', () => {
  const { core, root } = setup()
  const lib = core.dispatch({
    type: 'system.create',
    payload: { name: 'Checkout API', contract: { 'serviceTime.p99': { max: 40, unit: 'ms' } } },
  })
  diamond(core, lib)
  const [check] = core.checkContracts(lib)
  assert.equal(check.status, 'violated')
  assert.equal(check.value, 65)
  assert.match(check.message, /65 ms, above the contract maximum of 40 ms/)
  const placed = core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: lib } })
  const problems = core.problems().filter(p => p.code === 'CONTRACT_VIOLATION')
  assert.equal(problems.length, 1)
  assert.equal(problems[0].id, lib)

  const client = add(core, root, 'test.service', 'Front', { props: { serviceTime: 3 } })
  core.dispatch({
    type: 'boundary.add',
    payload: {
      systemId: lib,
      name: 'in',
      direction: 'in',
      internalPortId: core.portsOf(core.nodesOf(lib)[0].id).find(p => p.name === 'in').id,
    },
  })
  connect(core, client, 'out', placed, 'in', { connectionType: 'http' })
  assert.equal(
    core.rollup(root, 'serviceTime.p99').value,
    68,
    'expanded: the child is simulated in full'
  )
  assert.equal(
    core.rollup(root, 'serviceTime.p99', { abstract: [lib] }).value,
    43,
    'abstract: the child is a black box at its contract'
  )

  core.dispatch({
    type: 'system.update',
    payload: { id: lib, changes: { contract: { 'serviceTime.p99': { max: 80 } } } },
  })
  assert.equal(core.checkContracts(lib)[0].status, 'ok')
  assert.equal(core.problems().filter(p => p.code === 'CONTRACT_VIOLATION').length, 0)
})

test('an empty subsystem is valued from its contract (stubbing unfinished work)', () => {
  const { core, root } = setup()
  const stub = core.dispatch({
    type: 'system.create',
    payload: { name: 'Fraud (TBD)', contract: { 'serviceTime.p99': { max: 30 } } },
  })
  core.dispatch({ type: 'boundary.add', payload: { systemId: stub, name: 'in', direction: 'in' } })
  const front = add(core, root, 'test.service', 'Front', { props: { serviceTime: 4 } })
  const fraud = core.dispatch({ type: 'node.place', payload: { systemId: root, systemRef: stub } })
  connect(core, front, 'out', fraud, 'in', { connectionType: 'http' })
  assert.equal(core.rollup(root, 'serviceTime.p99').value, 34)
})
