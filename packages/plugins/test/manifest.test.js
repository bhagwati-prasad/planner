// Manifest validation (task 0301): identity, strataApi, ports and what they expose, properties,
// state, public and private methods, metrics, templates and migrations (spec §6, §8, eng §10).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ERROR_CODES } from '../../core/src/index.js'
import { validateManifest } from '../src/index.js'

/** The example manifest of spec §8, read from the spec so that the two cannot drift apart. */
function specExample() {
  const spec = readFileSync(
    new URL('../../../docs/spec/08-component-plugin-model.md', import.meta.url),
    'utf8'
  )
  const block = spec.slice(spec.indexOf('## Manifest')).match(/```json\n([\s\S]*?)\n```/)
  assert.ok(block, 'spec §8 shows a JSON manifest')
  return JSON.parse(block[1])
}

/** @param {import('../src/bundle.js').Problem[]} problems */
const errors = problems => problems.filter(p => p.level === 'error')

describe('validateManifest', () => {
  it('passes the spec §8 example manifest with no errors or warnings', () => {
    assert.deepEqual(validateManifest(specExample()), [])
  })

  it('fails a port exposing an undeclared method with E_MANIFEST_UNKNOWN_METHOD', () => {
    const manifest = specExample()
    manifest.ports[0].exposes.push('purge')
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_UNKNOWN_METHOD']
    )
    assert.match(found[0].message, /port 'in' exposes 'purge'/)
  })

  it('fails a state field without an initial value', () => {
    const manifest = specExample()
    delete manifest.state.messages.initial
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_STATE']
    )
    assert.match(found[0].message, /state\.messages has no initial value/)
  })

  it('fails an unsupported strataApi range with a message naming the supported range', () => {
    const found = errors(validateManifest({ ...specExample(), strataApi: '^2.0' }))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_API_RANGE']
    )
    assert.match(found[0].message, /'\^2\.0'.* supports plugin API \^1\.0/)
  })

  it('fails a state field whose type state cannot hold, or whose initial value does not fit it', () => {
    const manifest = specExample()
    manifest.state.inFlight.initial = []
    manifest.state.cursor = { type: 'widget', initial: 0 }
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_STATE', 'E_MANIFEST_STATE']
    )
    assert.match(found[0].message, /state\.inFlight\.initial must be an object/)
    assert.match(found[1].message, /state\.cursor\.type must be one of .*queue/)
  })

  it('fails a method whose latency is neither a distribution nor a distribution property, or whose errors are not a list', () => {
    const manifest = specExample()
    manifest.methods.public.publish.latency = 'capacity'
    manifest.methods.public.publish.errors = 'QUEUE_FULL'
    manifest.methods.private.redeliver.latency = { kind: 'gamma' }
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_METHOD', 'E_MANIFEST_METHOD', 'E_MANIFEST_METHOD']
    )
    const text = found.map(p => p.message).join('\n')
    assert.match(text, /methods\.public\.publish\.latency names 'capacity', an integer/)
    assert.match(text, /methods\.public\.publish\.errors must be a list/)
    assert.match(text, /methods\.private\.redeliver\.latency/)
  })

  it('accepts servers that name properties, state fields or numbers, and fails others with E_MANIFEST_SERVERS', () => {
    const manifest = specExample()
    manifest.servers = { count: ['capacity', 2], backlog: 0, timeout: 'retention' }
    assert.deepEqual(validateManifest(manifest), [], 'ADR 0020')
    manifest.state.live = { type: 'integer', initial: 1 }
    manifest.servers = { count: 'capacity', backlog: 'state.missing', timeout: -5 }
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_SERVERS', 'E_MANIFEST_SERVERS', 'E_MANIFEST_SERVERS']
    )
    const text = found.map(p => p.message).join('\n')
    assert.match(text, /servers\.count must be a list/)
    assert.match(text, /servers\.backlog names 'state\.missing', which is not a state field/)
    assert.match(text, /servers\.timeout must be a number of 0 or more/)
    manifest.servers = { count: ['state.live', 'instances'] }
    assert.deepEqual(
      validateManifest(manifest).map(p => [p.level, p.message]),
      [
        [
          'warning',
          "servers.count[1] names 'instances', which this manifest does not declare; it must come from the base type",
        ],
      ],
      'a property may come from the base type'
    )
  })

  it('accepts servers that name their busy and waiting gauges, and fails other metrics', () => {
    const manifest = specExample()
    manifest.servers = {
      count: ['capacity'],
      metrics: { busy: 'activeConnections', waiting: 'waitingConnections' },
    }
    assert.deepEqual(validateManifest(manifest), [], 'ADR 0020 amendment')
    manifest.servers.metrics = { busy: 3, queued: 'waiting' }
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_SERVERS', 'E_MANIFEST_SERVERS']
    )
    const text = found.map(p => p.message).join('\n')
    assert.match(text, /servers\.metrics\.busy must be a metric name/)
    assert.match(text, /servers\.metrics\.queued is not busy or waiting/)
  })

  it('fails templates that are not file lists and migrations that are not modules, without the folder', () => {
    const manifest = specExample()
    manifest.templates.docs = 'templates/runbook.md'
    manifest.migrations['1.x'] = 'migrations/v1-to-v2.txt'
    const found = errors(validateManifest(manifest))
    assert.deepEqual(
      found.map(p => p.code),
      ['E_MANIFEST_FILE', 'E_MANIFEST_FILE']
    )
    assert.match(found[0].message, /templates\.docs must be a list of files/)
    assert.match(found[1].message, /migrations\['1\.x'\] must be a JavaScript module/)
  })

  it('gives every error a registered E_MANIFEST_ code', () => {
    const found = errors(
      validateManifest(
        {
          id: 'base:Bad Id',
          version: '1',
          kind: 'widget',
          extends: 'acme.q@latest',
          ports: [
            { name: 'in', direction: 'sideways', exposes: 'publish' },
            { name: 'in', direction: 'in' },
          ],
          properties: { size: { type: 'integer', default: 'big' } },
          state: 'none',
          methods: { public: [] },
          metrics: { depth: { rollup: 'average' }, age: { estimate: '' } },
          icon: 'icon.png',
          entry: 'index.ts',
        },
        { files: ['manifest.json'] }
      )
    )
    assert.ok(found.length >= 12, `expected every problem, got ${found.length}`)
    for (const problem of found) {
      assert.match(problem.code ?? '', /^E_MANIFEST_/, problem.message)
      assert.ok(problem.code && problem.code in ERROR_CODES, `${problem.code} is registered`)
    }
  })
})
