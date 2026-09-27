import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Collection, NodeHandle, SystemHandle, StrataError } from '../src/index.js'
import { createTestStrata } from './fixtures.js'

/** The console session from spec §16, up to (not including) sim/test/docs, which arrive later. */
async function specSession() {
  const t = createTestStrata()
  const { strata } = t
  await strata.projects.create('checkout')
  const p = await strata.projects.open('checkout')
  const root = p.root
  const gw = root.add('api-gateway', { name: 'Edge GW', props: { rateLimit: 1000 } })
  const svc = root.add('service', { name: 'Orders' })
  const db = root.add('relational-db', { name: 'Orders DB' })
  root.connect(gw.port('out'), svc.port('in'), { type: 'http' })
  root.connect(svc.port('db'), db.port('in'), { type: 'db-protocol' })
  const orders = root.extract([svc.id, db.id], { name: 'Orders System' })
  return { ...t, p, root, gw, svc, db, orders }
}

test('the console session from the spec works end to end', async () => {
  const { strata, p, root, gw, svc, db, orders } = await specSession()
  assert.equal(strata.project, p)
  assert.equal(gw.type, 'starter.api-gateway@1.0.0')
  assert.equal(gw.props.rateLimit, 1000)
  assert.equal(
    svc.type,
    'starter.service@1.0.0',
    "'service' finds the concrete component, not base:service"
  )

  assert.ok(orders instanceof SystemHandle)
  assert.equal(orders.name, 'Orders System')
  assert.deepEqual(
    root.nodes().map(n => n.name),
    ['Edge GW', 'Orders System']
  )
  assert.deepEqual(
    orders.nodes().map(n => n.name),
    ['Orders', 'Orders DB']
  )
  assert.equal(svc.system.id, orders.id, 'handles stay live after the extract')

  const current = orders.enter()
  assert.equal(current.id, orders.id)
  assert.equal(strata.nav.breadcrumb, 'checkout › Orders System')
  assert.equal(
    orders.rollup('latency.p99'),
    95,
    'service p99 80 ms + database p99 15 ms along the critical path'
  )
  assert.deepEqual(orders.rollup('latency.p99', { detail: true }).path, [svc.id, db.id])
  assert.equal(root.rollup('latency.p99'), 100, 'the gateway adds its own 5 ms at the parent level')

  assert.equal(strata.$, null)
  strata.select(svc)
  assert.ok(strata.$ instanceof NodeHandle && strata.$.equals(svc))
  strata.select(svc, db)
  assert.deepEqual(strata.$.ids(), [svc.id, db.id])
})

test('strata.print(root) renders a text tree', async () => {
  const { strata, printed, root } = await specSession()
  strata.print(root)
  assert.equal(
    printed.at(-1),
    [
      'checkout  [context] · 2 nodes',
      '├─ Edge GW  starter.api-gateway@1.0.0',
      '│    out → Orders System.in  (http)',
      '└─ ▣ Orders System  (by value · 2 nodes)',
      '   ├─ Orders  starter.service@1.0.0',
      '   │    db → Orders DB.in  (db-protocol)',
      '   └─ Orders DB  starter.relational-db@1.0.0',
    ].join('\n')
  )
  assert.equal(strata.format(root, { depth: 1 }).split('\n').length, 4)
  assert.equal(strata.format(), strata.format(root), 'with no target, prints the current system')
  const project = strata.format(strata.project)
  assert.match(project, /^Project checkout · rev \d+ · 2 systems · 4 nodes/)
})

test('help lists topics, shows signatures with examples, and explains what arrives later', () => {
  const { strata, printed } = createTestStrata()
  strata.help()
  assert.match(printed.at(-1), /strata.help\('system'\)/)
  assert.match(printed.at(-1), /strata.test .*\(R1\)/)
  strata.help('system')
  assert.match(printed.at(-1), /sys.extract\(nodes, \{ name \}\)/)
  assert.match(printed.at(-1), /e\.g\. const orders = root.extract/)
  strata.help('test')
  assert.match(printed.at(-1), /^strata.test arrives in R1/)
  assert.match(strata.helpText('nope'), /No help topic 'nope'/)
})

test('namespaces from later releases explain themselves instead of failing obscurely', async () => {
  const { strata } = createTestStrata()
  assert.throws(
    () => strata.test.run({ tags: ['slo'] }),
    err =>
      err instanceof StrataError && err.code === 'UNSUPPORTED' && /arrives in R1/.test(err.message)
  )
  assert.throws(() => strata.comments.add(), /M6/)
  assert.equal(
    await Promise.resolve(strata.docs).then(() => 'resolved'),
    'resolved',
    'awaiting a planned namespace does not hang'
  )
})

test('collections have toTable() for console.table', async () => {
  const { root } = await specSession()
  const rows = root.nodes().toTable()
  assert.deepEqual(
    rows.map(r => [r.name, r.type]),
    [
      ['Edge GW', 'starter.api-gateway@1.0.0'],
      ['Orders System', '▣ Orders System (value)'],
    ]
  )
  assert.ok(!(rows instanceof Collection), 'rows are a plain array')
  const edgeRows = root.edges().toTable()
  assert.deepEqual(
    edgeRows.map(r => `${r.from} → ${r.to} ${r.type}`),
    ['Edge GW.out → Orders System.in http']
  )
  assert.deepEqual(
    root
      .children()
      .toTable()
      .map(r => r.name),
    ['Orders System']
  )
  assert.ok(
    !(root.nodes().map(n => n.name) instanceof Collection),
    'derived arrays are plain arrays'
  )
  assert.equal(root.nodes().get('Edge GW').name, 'Edge GW')
})

test('node handles: effective props, explain, set and unset, ports, edges', async () => {
  const { gw, svc, db } = await specSession()
  assert.equal(svc.props.concurrency, 50)
  svc.set({ concurrency: 80 })
  assert.equal(svc.props.concurrency, 80)
  assert.equal(svc.explain().concurrency.source, 'override')
  svc.unset('concurrency')
  assert.equal(svc.explain().concurrency.source, 'default')
  assert.throws(() => svc.set({ concurency: 1 }), /Did you mean 'concurrency'/)
  assert.throws(() => svc.port('nope'), /has no port 'nope' \(has: in, out, db\)/)
  assert.deepEqual(
    svc.edges().map(e => String(e)),
    ['Edge<Orders.db → Orders DB.in>'],
    'Orders.in is reached through the boundary port, not an edge'
  )
  assert.equal(svc.port('in').connected, false)
  assert.equal(db.port('in').connected, true)
  assert.equal(gw.port('in').connected, false)
  assert.ok(Object.isFrozen(svc.props))
  svc.update({ owner: 'team-orders', status: 'existing' }).rename('Orders API')
  assert.deepEqual([svc.name, svc.owner, svc.status], ['Orders API', 'team-orders', 'existing'])
})

test('connect picks compatible ports from nodes, names and "Node.port" strings', async () => {
  const { strata } = createTestStrata()
  const p = await strata.projects.create('picking')
  const svc = p.root.add('service', { name: 'Svc' })
  const db = p.root.add('relational-db', { name: 'DB' })
  const gw = p.root.add('api-gateway', { name: 'GW' })
  const e1 = p.root.connect(svc, db)
  assert.equal(
    String(e1),
    'Edge<Svc.db → DB.in>',
    'the only type both sides share decides the ports'
  )
  assert.equal(e1.type, 'db-protocol')
  const e2 = p.root.connect('GW', 'Svc', { type: 'grpc' })
  assert.equal(String(e2), 'Edge<GW.out → Svc.in>')
  const other = p.root.add('service', { name: 'Other' })
  const e3 = p.root.connect('Svc.out', 'Other.in')
  assert.equal(e3.type, 'http')
  assert.throws(() => p.root.connect(db, svc), /No compatible ports/)
  assert.throws(() => p.root.connect('Nope', svc), /No node 'Nope'/)
  const e4 = gw.connect(other)
  assert.equal(String(e4), 'Edge<GW.out → Other.in>')
  e4.update({ label: 'internal' }).set({ timeout: '2s' })
  assert.deepEqual([e4.label, e4.props.timeout], ['internal', '2s'])
  e4.remove()
  assert.throws(
    () => e4.label,
    err => err.code === 'NOT_FOUND'
  )
})

test('navigation: enter, up, home, breadcrumbs and events; the path heals after structural edits', async () => {
  const { strata, root, orders, db } = await specSession()
  const events = []
  strata.on('navigate', e => events.push(e.breadcrumb))
  const storage = orders.extract([db], { name: 'Storage' })
  storage.enter()
  assert.equal(strata.nav.breadcrumb, 'checkout › Orders System › Storage')
  assert.equal(strata.nav.depth, 2)
  assert.equal(strata.nav.up().name, 'Orders System')
  strata.nav.enter('Storage')
  strata.nav.home()
  assert.equal(strata.nav.current.id, root.id)
  strata.nav.enter(root.node('Orders System'))
  strata.nav.enter(storage)
  assert.deepEqual(events, [
    'checkout › Orders System › Storage',
    'checkout › Orders System',
    'checkout › Orders System › Storage',
    'checkout',
    'checkout › Orders System',
    'checkout › Orders System › Storage',
  ])
  orders.inline(storage.via)
  assert.equal(
    strata.nav.breadcrumb,
    'checkout › Orders System',
    'the path drops the dissolved level'
  )
  assert.throws(() => strata.nav.enter(orders.node('Orders')), /not a composite/)
})

test('systems placed by reference are read-only where they are placed', async () => {
  const { strata } = createTestStrata()
  const p = await strata.projects.create('shared')
  const auth = p.createSystem('Standard Auth Service', { levelTag: 'container' })
  const svc = auth.add('service', { name: 'Auth' })
  auth.expose(svc.port('in'))
  const placed = p.root.place(auth)
  assert.equal(placed.placement, 'reference')
  assert.deepEqual(
    placed.ports().map(port => port.name),
    ['in']
  )
  const inside = placed.enter()
  assert.equal(inside.readOnly, true)
  assert.equal(strata.nav.current.readOnly, true)
  assert.throws(
    () => inside.add('service'),
    err => err.code === 'READ_ONLY' && /project.system\('Standard Auth Service'\)/.test(err.message)
  )
  assert.throws(
    () => inside.node('Auth').set({ concurrency: 2 }),
    err => err.code === 'READ_ONLY'
  )
  p.system('Standard Auth Service').add('relational-db', { name: 'Users DB' })
  assert.deepEqual(
    inside.nodes().map(n => n.name),
    ['Auth', 'Users DB'],
    'changes in the source show through the reference'
  )
  const copy = placed.detach()
  assert.equal(copy.readOnly, false)
  copy.add('service', { name: 'Extra' })
  assert.equal(p.system(auth.id).nodes().length, 2, 'the source is untouched')
})

test('projects persist through storage and reopen in a fresh session', async () => {
  const first = createTestStrata()
  const p = await first.strata.projects.create('Checkout')
  p.root.add('service', { name: 'Orders' })
  await p.save()
  await first.strata.projects.create('Billing')
  assert.deepEqual(
    (await first.strata.projects.list()).map(r => [r.name, r.open]),
    [
      ['Billing', true],
      ['Checkout', true],
    ]
  )

  const second = createTestStrata({ storage: first.storage, seed: 2 })
  const reopened = await second.strata.projects.open('checkout')
  assert.equal(reopened.id, p.id)
  assert.deepEqual(
    reopened.root.nodes().map(n => n.name),
    ['Orders']
  )
  assert.equal(reopened.canUndo, false, 'history does not travel with the file')
  await assert.rejects(
    second.strata.projects.open('nope'),
    err => err.code === 'NOT_FOUND' && /Saved projects: 'Billing', 'Checkout'/.test(err.message)
  )

  second.strata.projects.close(reopened)
  assert.equal(second.strata.project, null)
  assert.throws(
    () => reopened.dispatch({ type: 'project.update', payload: { changes: { name: 'x' } } }),
    /closed/
  )
  await second.strata.projects.delete('Billing')
  assert.deepEqual(
    (await second.strata.projects.list()).map(r => r.name),
    ['Checkout']
  )
  await assert.rejects(
    first.strata.projects.create('Dup', { id: p.id }),
    err => err.code === 'CONFLICT'
  )
})

test('switching projects switches the target of dispatch, undo and selection', async () => {
  const { strata } = createTestStrata()
  const a = await strata.projects.create('A')
  const svc = a.root.add('service', { name: 'Svc' })
  strata.select(svc)
  const b = await strata.projects.create('B')
  assert.equal(strata.project, b)
  assert.equal(strata.$, null, 'selection belongs to a project')
  assert.equal(strata.undo(), false, 'B has nothing to undo')
  strata.projects.use(a)
  assert.equal(strata.undo(), true)
  assert.equal(a.root.nodes().length, 0)
  assert.equal(strata.redo(), true)
  assert.deepEqual(
    strata.projects.opened().map(p => p.name),
    ['A', 'B']
  )
})

test('transactions group console work into one undo step, and events carry the project', async () => {
  const { strata } = createTestStrata()
  const p = await strata.projects.create('tx')
  const changes = []
  strata.on('change', ({ project, op }) => changes.push([project.name, op.command]))
  strata.transaction(
    () => {
      const a = p.root.add('api-gateway', { name: 'GW', at: { x: 0, y: 0 } })
      const b = p.root.add('service', { name: 'Svc', at: { x: 200, y: 0 } })
      p.root.connect(a, b)
    },
    { label: 'Scaffold' }
  )
  assert.deepEqual(changes, [['tx', 'batch']])
  assert.deepEqual(p.root.node('Svc').position, { x: 200, y: 0 })
  strata.undo()
  assert.equal(p.root.nodes().length, 0)
  assert.equal(p.oplog.at(-1).meta.undoOf, p.oplog.at(-2).id)
})

test('selection drops deleted items and rejects unknown ids', async () => {
  const { strata, svc, db } = await specSession()
  strata.select([svc, db.id])
  db.remove()
  assert.ok(strata.$ instanceof NodeHandle)
  assert.throws(
    () => strata.select('ghost'),
    err => err.code === 'NOT_FOUND'
  )
  strata.select()
  assert.equal(strata.$, null)
})

test('the facade does not expose the core', async () => {
  const { strata, root, svc } = await specSession()
  for (const obj of [strata, root, svc, strata.project, svc.port('in')]) {
    assert.equal('core' in obj, false)
    assert.equal(
      Object.keys(obj).some(k => k.toLowerCase().includes('core')),
      false
    )
  }
  assert.equal(String(strata), 'Strata<checkout>')
})

test('components: list, get and register', () => {
  const { strata } = createTestStrata()
  const ids = strata.components.list().map(c => c.id)
  assert.ok(ids.includes('base:service') && ids.includes('starter.service'))
  assert.deepEqual(strata.components.get('service').lineage, [
    'starter.service',
    'base:service',
    'base:component',
  ])
  strata.components.register({
    id: 'acme.cache',
    name: 'Cache',
    version: '0.1.0',
    extends: 'base:cache',
  })
  assert.equal(strata.components.get('acme.cache').ports.length, 2)
})

test('printing a node shows ports with their connections and props with their source', async () => {
  const { strata, svc } = await specSession()
  svc.set({ concurrency: 64, availabilityTarget: 99.95 })
  const text = strata.format(svc)
  assert.match(text, /^Orders {2}starter\.service@1\.0\.0 · planned/)
  assert.match(text, /db \(out, db-protocol\) {2}→ Orders DB\.in/)
  assert.match(text, /in \(in, http\|grpc\) {2}⇠ boundary port 'in' of Orders System/)
  assert.match(text, /concurrency = 64$/m)
  assert.match(text, /instances = 1 {2}\(default\)/)
  assert.match(text, /availabilityTarget = 99\.95%$/m, 'percentages print in points')
})

test('without an open project, calls explain what to do', () => {
  const { strata } = createTestStrata()
  assert.throws(() => strata.nav, /No project is open/)
  assert.throws(() => strata.dispatch({ type: 'component.add' }), /projects.create/)
  assert.match(strata.format(), /No project is open/)
})
