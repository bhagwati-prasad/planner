// @ts-check
// The walking skeleton's core (task 0008): a project with one system, two components and an
// edge added through the command bus by `createStrata()`, then undone in order.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeClock, createRandom } from '../../../tools/testing/index.js'
import { createMemoryStorage, createStrata } from '../../facade/src/index.js'

const SERVICE = {
  id: 'skeleton.service',
  name: 'Service',
  version: '1.0.0',
  category: 'Compute',
  extends: 'base:service',
  ports: [
    { name: 'in', direction: 'in', accepts: ['http'] },
    { name: 'out', direction: 'out', accepts: ['http'] },
  ],
}

/** A strata with an open project whose root is the one system, on a fake clock and seeded ids. */
async function skeleton() {
  const clock = createFakeClock({ start: Date.UTC(2026, 8, 26, 9) })
  const random = createRandom(8)
  const strata = createStrata({
    storage: createMemoryStorage(),
    clock: clock.now,
    random: n => Uint8Array.from({ length: n }, () => random.uint32() & 0xff),
    identity: { id: 'user-1', name: 'Ada' },
    output: () => {},
  })
  strata.components.register(SERVICE)
  await strata.projects.create('skeleton')
  await strata.projects.open('skeleton')
  const root = strata.project.root
  /** @param {string} name */
  const addComponent = name =>
    strata.dispatch({
      type: 'component.add',
      payload: { systemId: root.id, typeRef: 'skeleton.service@1.0.0', name },
    })
  /** @param {string} componentId @param {string} port */
  const portOf = (componentId, port) => strata.project.node(componentId).port(port).id
  return { strata, root, addComponent, portOf }
}

describe('walking skeleton core', () => {
  it('adding two components and an edge yields a graph with 2 components and 1 edge', async () => {
    const { strata, root, addComponent, portOf } = await skeleton()
    const a = addComponent('A')
    const b = addComponent('B')
    const edge = strata.dispatch({
      type: 'edge.add',
      payload: { fromPort: portOf(a, 'out'), toPort: portOf(b, 'in') },
    })
    assert.deepEqual(
      root.nodes().map(n => n.name),
      ['A', 'B']
    )
    assert.deepEqual(
      root.edges().map(e => e.id),
      [edge]
    )
    assert.equal(strata.project.root.edges()[0].entity.connectionType, 'http')
  })

  it('undo removes the edge, then the second component', async () => {
    const { strata, root, addComponent, portOf } = await skeleton()
    const a = addComponent('A')
    const b = addComponent('B')
    strata.dispatch({
      type: 'edge.add',
      payload: { fromPort: portOf(a, 'out'), toPort: portOf(b, 'in') },
    })
    strata.undo()
    assert.equal(root.edges().length, 0)
    assert.deepEqual(
      root.nodes().map(n => n.name),
      ['A', 'B']
    )
    strata.undo()
    assert.deepEqual(
      root.nodes().map(n => n.name),
      ['A']
    )
  })

  it('an edge to a missing port fails with E_PORT_NOT_FOUND', async () => {
    const { strata, root, addComponent, portOf } = await skeleton()
    const a = addComponent('A')
    assert.throws(
      () =>
        strata.dispatch({
          type: 'edge.add',
          payload: { fromPort: portOf(a, 'out'), toPort: 'no-such-port' },
        }),
      err => err.code === 'E_PORT_NOT_FOUND' && /no-such-port/.test(err.message)
    )
    assert.equal(root.edges().length, 0)
  })
})
