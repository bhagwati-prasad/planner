// The starter library (spec §8) packed with the real packer and used through the facade.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStrata } from '../src/index.js'
import { packComponent, validateManifest } from '../../plugins/src/index.js'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Every plugin folder of the starter library, as { name, files }. */
function starterFolders () {
  const out = []
  for (const group of ['components', 'connection-types']) {
    for (const name of readdirSync(join(ROOT, group)).filter(n => statSync(join(ROOT, group, n)).isDirectory()).sort()) {
      const dir = join(ROOT, group, name)
      const files = {}
      const walk = d => {
        for (const entry of readdirSync(d)) {
          const path = join(d, entry)
          if (statSync(path).isDirectory()) walk(path)
          else files[relative(dir, path).split('\\').join('/')] = readFileSync(path)
        }
      }
      walk(dir)
      out.push({ group, name, files })
    }
  }
  return out
}

function starterStrata () {
  const strata = createStrata({ output: () => {} })
  for (const { name, files } of starterFolders()) {
    const result = packComponent(files, { name })
    assert.deepEqual(result.problems, [], `${name} packs cleanly`)
    strata.components.install(/** @type {any} */ (result.bundle))
  }
  return strata
}

test('the starter library has the 19 components and 6 connection types of spec §8, all valid', () => {
  const folders = starterFolders()
  assert.equal(folders.filter(f => f.group === 'components').length, 19)
  assert.deepEqual(folders.filter(f => f.group === 'connection-types').map(f => f.name), ['async-message', 'db-protocol', 'file-batch', 'grpc', 'http', 'websocket'])
  for (const { name, files } of folders) {
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    assert.deepEqual(validateManifest(manifest, { files: Object.keys(files) }), [], name)
    const readme = new TextDecoder().decode(files['README.md'])
    for (const key of Object.keys(manifest.properties)) assert.ok(readme.includes(`\`${key}\``), `${name}/README.md documents ${key}`)
    if (manifest.kind !== 'connection-type') {
      assert.match(manifest.id, /^starter\.[a-z-]+$/)
      assert.ok(files['icon.svg'], `${name} has an icon`)
    }
  }
  const strata = starterStrata()
  assert.equal(strata.components.list({ kind: 'component' }).filter(c => c.source === 'bundle').length, 19)
  assert.deepEqual(strata.components.connectionTypes().map(t => t.id), ['async-message', 'db-protocol', 'file-batch', 'grpc', 'http', 'websocket'])
})

test('a checkout flow built from starter parts picks sensible connection types', async () => {
  const strata = starterStrata()
  const p = await strata.projects.create('checkout')
  const root = p.root
  const web = root.add('client', { name: 'Web shop' })
  const cdn = root.add('cdn', { name: 'CDN' })
  const gw = root.add('api-gateway', { name: 'Gateway', props: { rateLimit: '1000/s' } })
  const svc = root.add('starter.service', { name: 'Orders', props: { monthlyCost: 400, instances: 3 } })
  const db = root.add('relational-db', { name: 'Orders DB', props: { monthlyCost: 600 } })
  const queue = root.add('message-queue', { name: 'Order events' })
  const workers = root.add('worker-pool', { name: 'Fulfilment' })
  const cache = root.add('starter.cache', { name: 'Sessions' })

  const types = [
    root.connect(web, cdn), root.connect(cdn, gw), root.connect(gw, svc), root.connect(svc, db),
    root.connect(svc, queue), root.connect(queue, workers), root.connect(workers, cache)
  ].map(e => e.type)
  assert.deepEqual(types, ['http', 'http', 'http', 'db-protocol', 'async-message', 'async-message', null])

  const toDb = svc.port('out').edges().find(e => e.to.node.id === db.id)
  assert.ok(toDb)
  assert.equal(toDb.manifest?.id, 'db-protocol')
  assert.equal(p.edge(toDb.id).type, 'db-protocol')
  toDb.update({ label: 'orders-db' })
  assert.equal(p.edge('orders-db').id, toDb.id)
  assert.throws(() => p.edge('nope'), err => err.code === 'NOT_FOUND')
  assert.equal(toDb.props.poolSize, 10, 'connection type defaults')
  assert.equal(toDb.props.timeout, '5s', 'inherited from base:connection')
  toDb.set({ poolSize: 25, retries: 2 })
  assert.equal(toDb.explain().poolSize.source, 'override')
  assert.throws(() => toDb.set({ poolsize: 5 }), /Unknown property 'poolsize' .*Did you mean 'poolSize'\?/)
  assert.throws(() => toDb.set({ acquireTimeout: 'soon' }), /Invalid duration/)
  assert.equal(queue.port('out').edges()[0].props.mode, 'async')

  assert.throws(() => root.add('http'), /'http' is a connection type, not a component/)
  assert.equal(root.add('service').type, 'starter.service@1.0.0', 'short names prefer the starter component over base:service')

  const system = root.extract([svc, db, queue, workers], { name: 'Orders system' })
  assert.equal(system.rollup('monthlyCost'), 1000)
  assert.equal(system.rollup('instances'), 6)
  // Latency is estimated from each component's time distribution until simulation measures it,
  // along synchronous edges only: Orders (serviceTime p99 150) → Orders DB (readLatency p99 15).
  // The queue hand-off to the workers is asynchronous and does not count.
  assert.equal(system.rollup('latency.p99'), 165)
  // At the root there are no boundary ports: paths start at nodes nothing calls. The queue and
  // the workers are reached only asynchronously, so neither is an entry point of its own.
  const flat = await strata.projects.create('flat')
  const s1 = flat.root.add('starter.service', { name: 'S' })
  const q1 = flat.root.add('message-queue', { name: 'Q' })
  const w1 = flat.root.add('worker-pool', { name: 'W' })
  flat.root.connect(s1, q1)
  flat.root.connect(q1, w1)
  assert.equal(flat.root.rollup('latency.p99'), 150, 'the queue’s delivery delay and the workers do not slow the producer')
  assert.deepEqual([...p.problems()].filter(pr => pr.severity !== 'info'), [])
})

test('edge properties of a missing connection type are kept and reported', async () => {
  const strata = createStrata({ output: () => {} })
  const p = await strata.projects.create('bare')
  const a = p.root.add('base:service', { name: 'A' })
  const b = p.root.add('base:service', { name: 'B' })
  const edge = p.root.connect(a, b, { type: 'http' })
  assert.equal(p.problems().length, 0, 'an unknown type without values is fine')
  edge.set({ timeout: '2s' })
  assert.deepEqual(edge.props, { timeout: '2s' })
  assert.deepEqual(p.problems().map(pr => pr.code), ['MISSING_CONNECTION_TYPE'])
})
