// @ts-check
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fixtures } from '../index.js'

describe('fixture loader', () => {
  const load = fixtures(import.meta.url)

  it('returns a fixture from test/fixtures by name', () => {
    const fixture = load('two-services')
    assert.equal(fixture.format, 'strata')
    assert.equal(fixture.project.name, 'Two services')
    assert.notEqual(load('two-services'), fixture, 'each load is a fresh copy')
  })

  it('fails clearly for an unknown name, listing what exists', () => {
    assert.throws(
      () => load('three-services'),
      err => {
        assert.match(err.message, /No fixture 'three-services'/)
        assert.match(err.message, /tools\/testing\/test\/fixtures/)
        assert.match(err.message, /two-services/)
        return true
      }
    )
  })
})
