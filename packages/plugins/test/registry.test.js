// Component types by id@version (task 0302, spec §8 "Versioning and other plugin kinds"):
// versions coexist, projects pin the version they use, types that are not installed load as
// placeholders, and bundles whose integrity does not match are refused.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryStorage, createStrata } from '../../facade/src/index.js'
import { createFakeClock } from '../../../tools/testing/index.js'
import { packComponent } from '../src/index.js'
import { messageQueueFolder } from './fixtures.js'

/** @param {ReturnType<typeof createMemoryStorage>} [storage] */
const strataWith = storage =>
  createStrata({ clock: createFakeClock().now, ...(storage ? { storage } : {}) })

/**
 * The spec's message queue packed at a version, with its capacity defaulting to `capacity`.
 * @param {string} version @param {number} capacity
 */
function queueAt(version, capacity) {
  const folder = messageQueueFolder()
  const manifest = JSON.parse(folder['manifest.json'])
  manifest.version = version
  manifest.properties.capacity.default = capacity
  const { bundle } = packComponent({ ...folder, 'manifest.json': JSON.stringify(manifest) })
  assert.ok(bundle)
  return bundle
}

describe('component registry', () => {
  it('lets two versions of one id coexist and resolves each pinned version', async () => {
    const strata = strataWith()
    strata.components.install(queueAt('1.2.0', 100))
    const p = await strata.projects.create('queues')
    const old = p.root.add('message-queue', { name: 'Old queue' })
    strata.components.install(queueAt('2.0.0', 500))
    assert.deepEqual(strata.components.versions('acme.message-queue'), ['1.2.0', '2.0.0'])

    // The project pins 1.2.0, so an unversioned add keeps to it; a versioned one gets its own.
    const same = p.root.add('message-queue', { name: 'Same queue' })
    const next = p.root.add('acme.message-queue@2.0.0', { name: 'New queue' })
    assert.deepEqual(
      [old, same, next].map(n => [p.node(n.id).type, p.node(n.id).props.capacity]),
      [
        ['acme.message-queue@1.2.0', 100],
        ['acme.message-queue@1.2.0', 100],
        ['acme.message-queue@2.0.0', 500],
      ]
    )
    assert.equal(p.problems().length, 0)
  })

  it('loads a project using a type that is not installed with placeholders, and loses no data', async () => {
    const storage = createMemoryStorage()
    const author = strataWith(storage)
    author.components.install(queueAt('1.2.0', 100))
    const p = await author.projects.create('queues')
    const q = p.root.add('message-queue', {
      name: 'Orders queue',
      props: { capacity: 250, retention: '2d', overflowPolicy: 'block' },
    })
    p.root.add('service', { name: 'Orders' })
    await p.save()
    const saved = p.snapshot()

    // Another session, without the component, opens the project.
    const reader = strataWith(storage)
    const opened = await reader.projects.open('queues')
    const placeholder = opened.node(q.id)
    assert.equal(placeholder.type, 'acme.message-queue@1.2.0')
    // A placeholder keeps the values set on it; the defaults come back with the manifest.
    const set = ['capacity', 'retention', 'overflowPolicy']
    const values = (/** @type {any} */ node) => set.map(key => node.props[key])
    assert.deepEqual(values(placeholder), values(p.node(q.id)))
    assert.ok(
      opened
        .problems()
        .some(problem => /acme\.message-queue@1\.2\.0.*placeholder/.test(problem.message)),
      'the missing type is reported'
    )
    assert.deepEqual(opened.snapshot(), saved, 'the snapshot is unchanged')

    // Saving it and installing the component later brings the node back as it was.
    await opened.save()
    reader.components.install(queueAt('1.2.0', 100))
    assert.deepEqual(reader.projects.opened()[0].node(q.id).props, p.node(q.id).props)
    assert.equal(opened.problems().length, 0)
  })

  it('refuses a bundle whose integrity hash does not match, and registers nothing', () => {
    const strata = strataWith()
    const bundle = queueAt('1.2.0', 100)
    const tampered = {
      ...bundle,
      modules: { ...bundle.modules, 'index.js': `${bundle.modules['index.js']}\n// changed` },
    }
    assert.throws(
      () => strata.components.install(tampered),
      err => err.code === 'E_BUNDLE_INTEGRITY' && /changed after it was packed/.test(err.message)
    )
    assert.deepEqual(strata.components.versions('acme.message-queue'), [])
  })
})
