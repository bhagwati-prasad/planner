import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/index.js'
import { fixtures } from '../../../tools/testing/index.js'
import { createTestCore, modelState, setup, testRegistry } from './helpers.js'
import { buildRecursive, probe } from './recursive-probe.js'

const fixture = fixtures(import.meta.url)

/** @param {import('../src/index.js').Core} c @param {string} name */
const named = (c, name) => c.nodesOf(c.rootSystemId).find(n => n.name === name)

describe('typed nodes', () => {
  it('every node has a typeRef, and a placed system is a strata.system component with innerSystemRef and placement', () => {
    const { core: c, root } = setup()
    buildRecursive(c, root)
    for (const node of c.all('node')) {
      assert.match(node.typeRef, /^[\w.:-]+@\d+\.\d+\.\d+$/, `${node.name} has a component type`)
      assert.ok(!('kind' in node) && !('systemRef' in node), `${node.name} has no untyped fields`)
    }
    const payments = named(c, 'Payments')
    assert.equal(payments.typeRef, 'strata.system@1.0.0')
    assert.equal(payments.placement, 'value')
    assert.equal(c.system(payments.innerSystemRef).name, 'Payments')
    const library = named(c, 'Auth')
    assert.equal(library.placement, 'reference')
    assert.equal(c.system(library.innerSystemRef).ownerNodeId, null, 'the library system itself')
    const client = named(c, 'Web client')
    assert.deepEqual([client.innerSystemRef, client.placement], [null, null])
    assert.equal(c.registry.resolve('strata.system').name, 'System')
  })

  it('a schema-version-2 snapshot fixture migrates to version 3, and its op log replays to the same state hash', () => {
    const v2 = fixture('schema-v2/recursive')
    assert.equal(v2.schemaVersion, 2)
    const migrated = core.migrateSnapshot(v2, { registry: testRegistry() })
    assert.equal(
      migrated.schemaVersion,
      core.SCHEMA_VERSION,
      'through version 3, to the current one'
    )
    assert.equal(migrated.project.schemaVersion, core.SCHEMA_VERSION)
    for (const node of migrated.nodes) {
      assert.ok(node.typeRef, `${node.name} is typed`)
      assert.ok(!('kind' in node) && !('systemRef' in node))
    }
    const payments = migrated.nodes.find(n => n.name === 'Payments')
    const before = v2.nodes.find(n => n.name === 'Payments')
    assert.equal(payments.typeRef, 'strata.system@1.0.0')
    assert.equal(payments.innerSystemRef, before.systemRef)
    assert.deepEqual(v2, fixture('schema-v2/recursive'), 'the migration does not change its input')

    const opened = createTestCore({ snapshot: v2 })
    const replayed = createTestCore()
    replayed.replay(fixture('schema-v2/recursive-oplog'))
    // The same model, entity by entity. Extract now runs as primitive steps (ADR 0012), so the
    // entities it creates and then maps count one more change in their own rev than the older
    // code recorded; rev only marks change for redraws and memoisation.
    assert.deepEqual(modelState(replayed), modelState(opened))
    assert.equal(replayed.snapshot().rev, opened.snapshot().rev, 'and the same model revision')
  })

  it('roll-ups, extract, inline and detach give the same results on the migrated fixture as before the change', () => {
    const recorded = fixture('schema-v2/recursive-results')
    assert.deepEqual(probe(createTestCore({ snapshot: fixture('schema-v2/recursive') })), recorded)
    const { core: c, root } = setup()
    buildRecursive(c, root)
    assert.deepEqual(probe(c), recorded, 'and on the same model built by the current commands')
  })
})
