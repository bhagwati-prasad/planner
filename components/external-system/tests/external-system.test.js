// @ts-check
// Self-tests of the starter external stub (task 0411, spec §9): it answers after its latency,
// fails at its error rate, and refuses calls beyond its capacity each second.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set() }

/** @param {Record<string, unknown>} props */
function stub(props) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { latency: { kind: 'constant', value: 50 }, ...props },
  })
  const run = api.runUntil
  api.runUntil = async ms => {
    await run(ms)
    for (const s of api.spans)
      if (s.node === 'it' && s.kind === 'public') covered.methods.add(s.method)
    for (const s of api.spans) if (s.node === 'it' && s.code) covered.errors.add(s.code)
  }
  return api
}

describe('external system', () => {
  it('answers after its latency, refuses calls beyond its capacity, and fails at its error rate', async () => {
    const api = stub({ capacity: '3/s' })
    const replies = Array.from({ length: 5 }, (_, i) => api.call('call', {}, { atMs: i }))
    const flaky = stub({ errorRate: 20, capacity: '10000/s' })
    const many = Array.from({ length: 1000 }, (_, i) => flaky.call('call', {}, { atMs: i }))
    await api.runUntil(1000)
    await flaky.runUntil(5000)
    assert.deepEqual(
      replies.map(r => r.error?.code ?? r.atUs / MS),
      [50, 51, 52, 'OVERLOADED', 'OVERLOADED']
    )
    const failed = many.filter(r => r.error?.code === 'UNAVAILABLE').length
    assert.ok(failed > 150 && failed < 250, `${failed} of 1000 fail at 20 %`)
  })

  it('covers every public method and every declared error', () => {
    const declared = Object.entries(manifest.methods.public)
    assert.deepEqual([...covered.methods].sort(), declared.map(([name]) => name).sort())
    const errors = new Set(declared.flatMap(([, method]) => method.errors ?? []))
    assert.deepEqual(
      [...covered.errors].filter(code => errors.has(code)).sort(),
      [...errors].sort()
    )
  })
})
