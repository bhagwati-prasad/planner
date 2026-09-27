import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRegistry, SYSTEM_TYPE_REF } from '../src/index.js'
import {
  buildRecursivePayments,
  registerFixtureTypes,
} from '../../../tools/fixtures/recursive-payments.js'
import { createTestCore } from './helpers.js'

/** Builds the fixture on a fresh core with a seeded id stream. */
function build(seed = 1) {
  const registry = createRegistry()
  registerFixtureTypes(registry)
  const core = createTestCore({ seed, registry })
  return { core, ids: buildRecursivePayments(core) }
}

describe('the recursive payments fixture', () => {
  it('passes graph and binding validation', () => {
    const { core } = build()
    assert.deepEqual(core.problems(), [])
  })

  it('contains every case listed in eng §9', () => {
    const { core, ids } = build()
    const root = core.rootSystemId
    let depth = 0
    core.walk(root, (_node, where) => {
      depth = Math.max(depth, where.depth)
    })
    assert.ok(depth >= 2, 'three levels deep')

    const nodes = core.all('node')
    const byReference = nodes.filter(n => n.placement === 'reference')
    const byValue = nodes.filter(n => n.placement === 'value' && n.typeRef === SYSTEM_TYPE_REF)
    const opened = nodes.filter(n => n.innerSystemRef && n.typeRef !== SYSTEM_TYPE_REF)
    assert.ok(byReference.length >= 1, 'an inner system placed by reference')
    assert.ok(byValue.length >= 1, 'an inner system placed by value')
    assert.equal(opened.length, 1, 'one component opened as a system')
    const [fraud] = opened
    assert.equal(fraud.id, ids.fraud)
    assert.equal(
      core.explainProps(fraud.id).serviceTime.source,
      'override',
      'it keeps its own properties, its black-box model'
    )

    for (const composite of nodes.filter(n => n.innerSystemRef))
      for (const port of core.portsOf(composite.id))
        for (const method of core.exposedMethods(port)) {
          const resolved = core.resolveBinding(composite.id, method, { port: port.name })
          assert.equal(
            core.node(resolved.nodeId).innerSystemRef,
            null,
            `${composite.name}.${method} is bound all the way down`
          )
        }
    assert.ok(
      core.resolveBinding(ids.payments, 'refund').path.length >= 3,
      'a method bound through two levels'
    )

    assert.equal(core.resolveSystem(ids.authPath).readOnly, true, 'read-only by reference')
    assert.equal(
      core.tryDispatch(
        { type: 'node.update', payload: { id: ids.tokenService, changes: { name: 'X' } } },
        { at: ids.authPath }
      ).code,
      'E_SYSTEM_READONLY'
    )
    assert.equal(
      core.tryDispatch({
        type: 'node.place',
        payload: {
          systemId: core.node(ids.ledger).innerSystemRef,
          systemRef: core.node(ids.payments).innerSystemRef,
        },
      }).code,
      'E_SYSTEM_CYCLE'
    )
  })

  it('building it twice with the same seed produces the same state hash', () => {
    assert.equal(build(7).core.stateHash(), build(7).core.stateHash())
    assert.notEqual(build(7).core.stateHash(), build(8).core.stateHash(), 'ids come from the seed')
  })
})
