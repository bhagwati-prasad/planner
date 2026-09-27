import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/index.js'
import { fixtures } from '../../../tools/testing/index.js'
import { add, connect, createTestCore, setup, testRegistry } from './helpers.js'

const fixture = fixtures(import.meta.url)

/**
 * The test registry plus an http connection type (so edges have property schemas) and a store
 * with a duration, a size and a bounded percentage.
 */
function registry() {
  const r = testRegistry()
  r.register({
    id: 'acme.http',
    kind: 'connection-type',
    name: 'HTTP',
    version: '1.0.0',
    extends: 'base:connection',
  })
  r.register({
    id: 'test.archive',
    name: 'Archive',
    version: '1.0.0',
    extends: 'base:store',
    ports: [{ name: 'in', direction: 'in', accepts: ['db-protocol'] }],
    properties: {
      retention: { type: 'duration', default: '4d' },
      blockSize: { type: 'bytes', default: '4 KB' },
      uptime: { type: 'percent', unit: '%', min: 90, default: 99 },
    },
  })
  return r
}

/** @param {number} a @param {number} b */
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} is not ${b}`)

describe('canonical property values', () => {
  it("node.setProps with '4d', '512 KB' and a percentage of 99.9 stores 345600000, 512000 and 0.999", () => {
    const { core: c, root } = setup({ registry: registry() })
    const id = add(c, root, 'test.archive', 'Archive', { props: { blockSize: '1 MB' } })
    assert.equal(c.node(id).props.blockSize, 1_000_000, 'component.add stores canonical values')

    c.dispatch({
      type: 'node.setProps',
      payload: { id, props: { retention: '4d', blockSize: '512 KB', uptime: 99.9 } },
    })
    assert.deepEqual(c.node(id).props, {
      retention: 345_600_000,
      blockSize: 512_000,
      uptime: 0.999,
    })
    assert.deepEqual(
      c.oplog.at(-1).payload.props,
      { retention: '4d', blockSize: '512 KB', uptime: 99.9 },
      'the operation keeps what was written, so replay converts it the same way'
    )
    assert.equal(core.formatQuantity('duration', c.node(id).props.retention), '4 d')
    assert.equal(core.formatQuantity('size', c.node(id).props.blockSize), '512 KB')
    assert.equal(core.formatQuantity('percent', c.node(id).props.uptime), '99.9%')
    assert.deepEqual(
      c.problems().filter(p => p.code === 'INVALID_PROPERTY'),
      [],
      'stored values are checked as stored: 0.999 is 99.9%, within min 90'
    )

    const client = add(c, root, 'test.service', 'Checkout')
    const service = add(c, root, 'test.service', 'Payments')
    const edge = connect(c, client, 'out', service, 'in', { connectionType: 'http' })
    c.dispatch({ type: 'edge.setProps', payload: { id: edge, props: { payloadSize: '64KB' } } })
    assert.equal(c.edge(edge).props.payloadSize, 64_000, 'edges too')
  })

  it("manifest defaults written as '4d' or 99.9 percent are canonical once the registry normalises the manifest", () => {
    const r = registry()
    const archive = r.resolve('test.archive')
    assert.equal(archive.properties.retention.default, 345_600_000)
    assert.equal(archive.properties.blockSize.default, 4000)
    assert.equal(archive.properties.uptime.default, 0.99)
    assert.equal(archive.properties.availabilityTarget.default, 0.999, 'inherited from base types')

    const { core: c, root } = setup({ registry: r })
    const id = add(c, root, 'test.archive', 'Archive')
    assert.equal(c.effectiveProps(id).retention, 345_600_000)
    assert.equal(c.effectiveProps(id).uptime, 0.99)
  })

  it('a schema-version-1 snapshot fixture migrates to version 2, and its op log replays to the same state hash', () => {
    const v1 = fixture('schema-v1/payments')
    assert.equal(v1.schemaVersion, 1)
    const migrated = core.migrateSnapshot(v1, { registry: registry() })
    assert.equal(migrated.schemaVersion, 2)
    assert.equal(migrated.project.schemaVersion, 2)
    const node = name => migrated.nodes.find(n => n.name === name)
    assert.equal(node('Settlement queue').props.retention, 172_800_000)
    assert.equal(node('Payment service').props.timeout, 1500)
    assert.equal(node('Payment service').props.availabilityTarget, 0.9995)
    assert.equal(node('Gateway').props.availabilityTarget, 0.999)
    assert.equal(migrated.edges.find(e => e.props.payloadSize).props.payloadSize, 64_000)
    assert.deepEqual(
      migrated.systems.find(s => s.id === migrated.project.rootSystemId).contract,
      {
        availabilityTarget: { min: 0.995, unit: '%' },
        'serviceTime.p99': { max: 200, unit: 'ms' },
      },
      'contracts on percentages become fractions'
    )
    assert.deepEqual(v1, fixture('schema-v1/payments'), 'the migration does not change its input')

    const opened = createTestCore({ snapshot: v1, registry: registry() })
    assert.equal(opened.snapshot().schemaVersion, 2, 'a core opens a version-1 snapshot')
    const replayed = createTestCore({ registry: registry() })
    replayed.replay(fixture('schema-v1/payments-oplog'))
    assert.equal(replayed.stateHash(), opened.stateHash())
  })

  it('explained values carry the form a person writes, which reads back to the same stored value', () => {
    const { core: c, root } = setup({ registry: registry() })
    const id = add(c, root, 'test.archive', 'Archive', {
      props: { retention: '1h30m', blockSize: '1.5 MB', uptime: 99.95 },
    })
    const explained = c.explainProps(id)
    assert.deepEqual(
      [explained.retention.input, explained.blockSize.input, explained.uptime.input],
      ['1 h 30 min', '1.5 MB', 99.95]
    )
    const stored = c.node(id).props
    const written = Object.fromEntries(
      Object.entries(explained).map(([key, { input }]) => [key, input])
    )
    c.dispatch({ type: 'node.setProps', payload: { id, props: written } })
    assert.deepEqual(
      Object.fromEntries(Object.keys(stored).map(key => [key, c.node(id).props[key]])),
      stored,
      'writing the written form back stores the same values'
    )
  })

  it('contracts on percentages are stored as fractions and reported in points', () => {
    const { core: c, root } = setup()
    const a = add(c, root, 'test.service', 'A', { props: { availabilityTarget: 99.9 } })
    const b = add(c, root, 'test.db', 'B', { props: { availabilityTarget: 99.9 } })
    connect(c, a, 'db', b, 'in')
    c.dispatch({
      type: 'system.update',
      payload: {
        id: root,
        changes: { contract: { availabilityTarget: { min: 99.9, unit: '%' } } },
      },
    })
    assert.deepEqual(c.system(root).contract.availabilityTarget, { min: 0.999, unit: '%' })
    const [result] = c.checkContracts(root)
    assert.equal(result.status, 'violated')
    assert.match(result.message, /is 99\.8%, below the contract minimum of 99\.9%/)
  })

  it('roll-ups read canonical values without converting: two components of 99.9% availability in series roll up to 0.998001', () => {
    const { core: c, root } = setup()
    const a = add(c, root, 'test.service', 'A', { props: { availabilityTarget: 99.9 } })
    const b = add(c, root, 'test.db', 'B', { props: { availabilityTarget: 99.9 } })
    connect(c, a, 'db', b, 'in')
    close(c.rollup(root, 'availabilityTarget').value, 0.998001)
  })
})
