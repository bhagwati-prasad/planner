import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStrata } from '../src/index.js'
import { packComponent } from '../../strata-plugins/src/index.js'
import { messageQueueFolder, makeZip } from '../../strata-plugins/test/fixtures.js'

const quiet = () => createStrata({ output: () => {} })
const packed = (folder = messageQueueFolder()) => {
  const r = packComponent(folder, { name: 'message-queue' })
  assert.ok(r.bundle && r.script)
  return { bundle: r.bundle, script: r.script }
}

test('installing a packed component makes it usable like any type', async () => {
  const strata = quiet()
  const events = []
  strata.on('components', e => events.push(e))
  const { script } = packed()
  const info = strata.components.install(script)
  assert.deepEqual(info, { id: 'acme.message-queue', version: '1.2.0', typeRef: 'acme.message-queue@1.2.0', name: 'Message Queue' })
  assert.deepEqual(events, [{ action: 'install', typeRef: 'acme.message-queue@1.2.0' }])

  const p = await strata.projects.create('queues')
  const q = p.root.add('message-queue', { name: 'Orders queue' })
  assert.equal(q.type, 'acme.message-queue@1.2.0')
  assert.deepEqual(q.ports().map(port => port.name), ['in', 'out', 'dlq'])
  assert.equal(q.props.capacity, 100000)

  const row = strata.components.list().find(c => c.id === 'acme.message-queue')
  assert.equal(row?.source, 'bundle')
  assert.equal(strata.components.list().find(c => c.id === 'base:queue')?.source, 'built-in')
  assert.match(strata.components.get('message-queue').iconSvg ?? '', /^<svg/)
  assert.equal(strata.components.bundle('message-queue')?.entry, 'index.js')
  assert.ok(Object.isFrozen(strata.components.bundle('message-queue')?.modules), 'stored bundles are frozen copies')
})

test('reinstalling: identical is a no-op, different contents need a new version or replace', () => {
  const strata = quiet()
  const { bundle } = packed()
  strata.components.install(bundle)
  let count = 0
  strata.on('components', () => count++)
  strata.components.install(structuredClone(bundle))
  assert.equal(count, 0)

  const changed = packed({ ...messageQueueFolder(), 'README.md': '# Changed\n' }).bundle
  assert.throws(() => strata.components.install(changed), err => err.code === 'CONFLICT' && /higher version, or pass \{ replace: true \}/.test(err.message))
  strata.components.install(changed, { replace: true })
  assert.equal(strata.components.bundle('acme.message-queue@1.2.0')?.assets['README.md'], '# Changed\n')

  const manifest = JSON.parse(messageQueueFolder()['manifest.json'])
  const v2 = packed({ ...messageQueueFolder(), 'manifest.json': JSON.stringify({ ...manifest, version: '2.0.0' }) }).bundle
  strata.components.install(v2)
  assert.deepEqual(strata.components.versions('acme.message-queue'), ['1.2.0', '2.0.0'], 'versions coexist')
  assert.throws(() => strata.components.install({ ...bundle, integrity: 'sha256-AAAA' }), /integrity mismatch/)
})

test('uninstalling leaves placeholders that keep their properties', async () => {
  const strata = quiet()
  strata.components.install(packed().bundle)
  const p = await strata.projects.create('queues')
  const q = p.root.add('message-queue', { name: 'Orders queue', props: { capacity: 500 } })
  assert.equal(strata.components.uninstall('acme.message-queue'), 1)
  assert.equal(strata.components.bundle('acme.message-queue'), null)
  assert.equal(p.node(q.id).props.capacity, 500)
  assert.ok(p.problems().some(problem => /not installed/.test(problem.message)))
  assert.throws(() => strata.components.uninstall('base:queue'), /built-in base type/)
  assert.throws(() => strata.components.uninstall('acme.nothing'), err => err.code === 'NOT_FOUND')
})

test('upload packs a zip or a folder with the same packer and installs it', async () => {
  const strata = quiet()
  const folder = Object.fromEntries(Object.entries(messageQueueFolder()).map(([path, content]) => [`message-queue/${path}`, content]))
  const { component, problems } = await strata.components.upload([{ path: 'message-queue.zip', content: makeZip(folder) }])
  assert.equal(component?.typeRef, 'acme.message-queue@1.2.0')
  assert.deepEqual(problems.map(p => p.level), ['warning'], 'the unused module is reported')
  assert.equal(strata.components.bundle('message-queue')?.integrity, packed().bundle.integrity)

  const broken = await strata.components.upload([{ path: 'q/manifest.json', content: '{}' }])
  assert.equal(broken.component, null)
  assert.ok(broken.problems.some(p => /strataApi is required/.test(p.message)))
})
