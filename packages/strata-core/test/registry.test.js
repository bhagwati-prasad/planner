import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRegistry, Registry, parseTypeRef, BUILTIN_MANIFESTS, StrataError } from '../src/index.js'
import { FIXTURE_MANIFESTS } from './helpers.js'

const queueManifest = FIXTURE_MANIFESTS[0]

test('built-in base types are registered by default', () => {
  const r = createRegistry()
  assert.deepEqual(r.list().map(m => m.id), BUILTIN_MANIFESTS.map(m => m.id).sort())
  assert.ok(r.isA('base:queue', 'base:component'))
  assert.equal(createRegistry({ builtins: false }).list().length, 0)
})

test('the manifest example from the spec registers and inherits from its base', () => {
  const r = createRegistry()
  r.register(queueManifest)
  const eff = r.resolve('acme.message-queue')
  assert.equal(eff.typeRef, 'acme.message-queue@1.2.0')
  assert.deepEqual(eff.lineage, ['acme.message-queue', 'base:queue', 'base:component'])
  assert.deepEqual(eff.ports.map(p => p.name), ['in', 'out', 'dlq'])
  assert.equal(eff.properties.capacity.rollup, 'sum')
  assert.equal(eff.properties.instances.default, 1, 'common properties come from base:component')
  assert.equal(eff.metrics.depth.unit, 'messages')
  assert.equal(eff.metrics['latency.p99'].rollup, 'critical-path')
  assert.ok(Object.isFrozen(eff))
  assert.ok(r.isA('acme.message-queue@1.2.0', 'base:queue'))
  assert.ok(!r.isA('acme.message-queue', 'base:service'))
})

test('several versions coexist; unversioned lookups return the latest', () => {
  const r = createRegistry()
  r.register(queueManifest)
  r.register({ ...queueManifest, version: '1.10.0' })
  r.register({ ...queueManifest, version: '1.9.0' })
  assert.deepEqual(r.versions('acme.message-queue'), ['1.2.0', '1.9.0', '1.10.0'])
  assert.equal(r.get('acme.message-queue').version, '1.10.0')
  assert.equal(r.get('acme.message-queue@1.2.0').version, '1.2.0')
  assert.equal(r.get('acme.message-queue@3.0.0'), null)
  assert.throws(() => r.register(queueManifest), /already registered/)
  r.register({ ...queueManifest, name: 'Renamed' }, { replace: true })
  assert.equal(r.get('acme.message-queue@1.2.0').name, 'Renamed')
  assert.ok(r.unregister('acme.message-queue', '1.10.0'))
  assert.equal(r.get('acme.message-queue').version, '1.9.0')
})

test('short names resolve when unambiguous; concrete components shadow base types', () => {
  const r = createRegistry()
  assert.equal(r.find('queue').id, 'base:queue')
  r.register({ id: 'acme.queue', name: 'Acme queue', version: '1.0.0', extends: 'base:queue' })
  assert.equal(r.find('queue').id, 'acme.queue')
  assert.equal(r.find('base:queue').id, 'base:queue')
  r.register({ id: 'other.queue', name: 'Other queue', version: '1.0.0', extends: 'base:queue' })
  assert.throws(() => r.find('queue'), err => err.code === 'AMBIGUOUS')
  assert.equal(r.find('acme.queue').id, 'acme.queue')
  assert.equal(r.find('nothing'), null)
  assert.throws(() => r.require('servce'), /Did you mean 'service'/)
})

test('invalid manifests are rejected with every problem listed', () => {
  const r = createRegistry()
  try {
    r.register({
      id: 'Bad Id',
      version: '1',
      strataApi: '^2.0',
      ports: [{ name: 'in', direction: 'sideways' }, { name: 'in', direction: 'in' }],
      properties: { size: { type: 'integer', default: 'big' } },
      metrics: { depth: { rollup: 'average' } }
    })
    assert.fail('expected an error')
  } catch (err) {
    assert.ok(err instanceof StrataError)
    assert.equal(err.code, 'INVALID')
    const details = err.details.join('\n')
    for (const fragment of ['id must be', 'name is required', 'version must be', 'strataApi', 'direction must be', 'duplicate port', 'size.default', 'metrics.depth.rollup']) {
      assert.ok(details.includes(fragment), `missing "${fragment}" in:\n${details}`)
    }
  }
})

test('a missing base type is reported, and circular extends are rejected', () => {
  const r = new Registry()
  r.register({ id: 'x.a', name: 'A', version: '1.0.0', extends: 'x.missing' })
  assert.equal(r.resolve('x.a').missingBase, 'x.missing')
  r.register({ id: 'x.b', name: 'B', version: '1.0.0', extends: 'x.c' })
  r.register({ id: 'x.c', name: 'C', version: '1.0.0', extends: 'x.b' })
  assert.throws(() => r.resolve('x.b'), err => err.code === 'CYCLE')
})

test('type references parse into id and version', () => {
  assert.deepEqual(parseTypeRef('base:queue'), { id: 'base:queue', version: null })
  assert.deepEqual(parseTypeRef('acme.q@1.2.0'), { id: 'acme.q', version: '1.2.0' })
  assert.throws(() => parseTypeRef('acme.q@latest'), /Invalid version/)
  assert.throws(() => parseTypeRef(''), /Invalid component type/)
})
