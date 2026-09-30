// Connection-type plugins (task 0308, spec §9 "Connection types"): the six built-in types are
// plugin folders that validate and register, their properties have units and defaults, and a
// type can declare the components it may join.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRegistry } from '../../core/src/index.js'
import { validateManifest } from '../src/index.js'

const DIR = new URL('../../../connection-types/', import.meta.url)
const TYPES = ['async-message', 'db-protocol', 'file-batch', 'grpc', 'http', 'websocket']

/** A built-in connection type's folder: its manifest and file names. @param {string} name */
function folder(name) {
  const at = new URL(`${name}/`, DIR)
  return {
    manifest: JSON.parse(readFileSync(new URL('manifest.json', at), 'utf8')),
    files: readdirSync(at),
  }
}

/** A registry with the six built-in connection types. */
function withTypes() {
  const registry = createRegistry()
  for (const name of TYPES) registry.register(folder(name).manifest)
  return registry
}

/** Spec §9: what every connection carries, and its routing rules (spec §5, ADR 0019). */
const COMMON = [
  'mode',
  'latency',
  'bandwidth',
  'packetLoss',
  'payloadSize',
  'timeout',
  'retries',
  'retryBackoff',
  'retryJitter',
  'tlsOverhead',
  'route',
]

describe('connection types', () => {
  it('validates and registers all six built-in connection types', () => {
    assert.deepEqual(readdirSync(DIR).sort(), TYPES)
    for (const name of TYPES) {
      const { manifest, files } = folder(name)
      assert.deepEqual(validateManifest(manifest, { files }), [], name)
    }
    assert.deepEqual(
      withTypes()
        .list({ kind: 'connection-type' })
        .filter(m => !m.abstract)
        .map(m => m.id),
      TYPES
    )
  })

  it('gives every property of each type a default, and a unit wherever a number needs one', () => {
    const registry = withTypes()
    for (const name of TYPES) {
      const { manifest } = folder(name)
      const type = registry.resolve(`${manifest.id}@${manifest.version}`)
      assert.ok(type, name)
      for (const key of COMMON) assert.ok(key in type.properties, `${name} carries ${key}`)
      for (const [key, schema] of Object.entries(type.properties)) {
        assert.notEqual(schema.default, undefined, `${name}.${key} has a default`)
        if (['number', 'integer', 'distribution', 'percent'].includes(schema.type))
          assert.ok(schema.unit, `${name}.${key} has a unit`)
      }
    }
  })

  it('lets a connection type declare the components it may join', () => {
    const registry = withTypes()
    registry.register({ id: 'acme.api', name: 'API', version: '1.0.0', extends: 'base:service' })
    registry.register({ id: 'acme.db', name: 'DB', version: '1.0.0', extends: 'base:store' })
    assert.deepEqual(registry.resolve('db-protocol')?.joins, { to: ['base:store'] })
    assert.equal(registry.joins('db-protocol', 'acme.api', 'acme.db'), true)
    assert.match(
      String(registry.joins('db-protocol', 'acme.db', 'acme.api')),
      /DB protocol joins only base:store as the target; API is not one/
    )
    assert.equal(registry.joins('http', 'acme.db', 'acme.api'), true, 'no joins: any components')

    const base = {
      strataApi: '^1.0',
      kind: 'connection-type',
      name: 'Queue link',
      version: '1.0.0',
      extends: 'base:connection',
    }
    assert.deepEqual(
      validateManifest({
        ...base,
        id: 'acme.link',
        joins: { from: ['base:service'], to: ['base:queue'] },
      }),
      []
    )
    const errors = (/** @type {object} */ m) =>
      validateManifest(m)
        .filter(p => p.level === 'error')
        .map(p => [p.code, p.message])
    assert.deepEqual(errors({ ...base, id: 'acme.bad', joins: { to: 'base:queue' } }), [
      ['E_MANIFEST_KIND', 'joins.to must be a list of component type ids, e.g. ["base:store"]'],
    ])
    assert.deepEqual(
      errors({
        strataApi: '^1.0',
        id: 'acme.thing',
        name: 'Thing',
        version: '1.0.0',
        extends: 'base:service',
        joins: {},
      }),
      [
        [
          'E_MANIFEST_KIND',
          'joins is for connection types, which name the components they may join',
        ],
      ]
    )
  })
})
