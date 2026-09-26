// @ts-check
// Immutable state helpers (task 0101, eng §7): setIn, updateIn and removeIn return a new root
// that shares every untouched branch, and committed state is deep-frozen in development.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gen, property } from '../../../tools/testing/index.js'
import { commitState, getIn, removeIn, setIn, updateIn } from '../src/index.js'

/** A small project-shaped state: entity maps keyed by id. */
const sample = () => ({
  rev: 3,
  components: {
    c1: { id: 'c1', name: 'Orders', tags: ['core'] },
    c2: { id: 'c2', name: 'Billing', tags: [] },
  },
  edges: { e1: { id: 'e1', from: 'c1', to: 'c2' } },
})

describe('setIn', () => {
  it('returns a new root and keeps untouched branches identical by reference', () => {
    const state = sample()
    const next = setIn(state, ['components', 'c1', 'name'], 'Orders API')
    assert.notEqual(next, state)
    assert.notEqual(next.components, state.components)
    assert.notEqual(next.components.c1, state.components.c1)
    assert.equal(next.components.c1.name, 'Orders API')
    assert.equal(
      next.components.c1.tags,
      state.components.c1.tags,
      'untouched field of a touched entity'
    )
    assert.equal(next.components.c2, state.components.c2, 'untouched entity')
    assert.equal(next.edges, state.edges, 'untouched map')
    assert.equal(state.components.c1.name, 'Orders', 'the original is unchanged')
  })

  it('returns the same root when the value is already there', () => {
    const state = sample()
    assert.equal(setIn(state, ['components', 'c1', 'name'], 'Orders'), state)
  })

  it('creates missing maps along the path and copies arrays it writes into', () => {
    const state = sample()
    const next = setIn(
      setIn(state, ['views', 'v1', 'x'], 10),
      ['components', 'c1', 'tags', 1],
      'api'
    )
    assert.deepEqual(next.views, { v1: { x: 10 } })
    assert.deepEqual(next.components.c1.tags, ['core', 'api'])
    assert.deepEqual(state.components.c1.tags, ['core'])
  })

  it('refuses to write through a value that is not an object or array', () => {
    assert.throws(
      () => setIn(sample(), ['rev', 'x'], 1),
      /** @param {any} err */ err => err.code === 'INVALID' && /rev/.test(err.message)
    )
  })
})

describe('updateIn and removeIn', () => {
  it('updateIn applies a function to the current value', () => {
    const next = updateIn(sample(), ['rev'], rev => rev + 1)
    assert.equal(next.rev, 4)
    assert.equal(getIn(next, ['components', 'c2', 'name']), 'Billing')
    assert.equal(getIn(next, ['components', 'nope', 'name']), undefined)
  })

  it('removeIn drops a key or an array item and shares the rest', () => {
    const state = sample()
    const next = removeIn(state, ['components', 'c2'])
    assert.deepEqual(Object.keys(next.components), ['c1'])
    assert.equal(next.components.c1, state.components.c1)
    assert.equal(next.edges, state.edges)
    const untagged = removeIn(state, ['components', 'c1', 'tags', 0])
    assert.deepEqual(untagged.components.c1.tags, [])
    assert.deepEqual(state.components.c1.tags, ['core'])
  })

  it('removeIn returns the same root when there is nothing to remove', () => {
    const state = sample()
    assert.equal(removeIn(state, ['components', 'c9']), state)
    assert.equal(removeIn(state, ['views', 'v1', 'x']), state)
  })
})

describe('commitState', () => {
  it('makes mutating committed state throw in development builds', () => {
    const committed = commitState(setIn(sample(), ['rev'], 4), { development: true })
    assert.throws(() => {
      committed.components.c1.name = 'Mutated'
    }, TypeError)
    assert.throws(() => {
      committed.components.c1.tags.push('x')
    }, TypeError)
    assert.throws(() => {
      delete committed.edges.e1
    }, TypeError)
  })

  it('leaves state unfrozen in production builds', () => {
    const committed = commitState(sample(), { development: false })
    assert.equal(Object.isFrozen(committed), false)
  })

  it('freezes only what changed when the rest was committed before', () => {
    const first = commitState(sample(), { development: true })
    const next = commitState(setIn(first, ['components', 'c2', 'name'], 'Invoices'), {
      development: true,
    })
    assert.ok(Object.isFrozen(next.components.c2))
    assert.equal(next.components.c1, first.components.c1)
  })
})

const KEYS = ['components', 'edges', 'c1', 'c2', 'name', 'tags', 0, 1, 'x']
const operation = gen.tuple(
  gen.bool(),
  gen.array(gen.oneOf(...KEYS), { min: 1, max: 4 }),
  gen.oneOf(0, 'a', null, true, ['z'], { k: 1 })
)

describe('state helpers (property)', () => {
  it('random sequences of setIn and removeIn never mutate the original', () => {
    property([gen.array(operation, { min: 1, max: 12 })], ops => {
      const original = sample()
      const before = structuredClone(original)
      let state = original
      for (const [set, path, value] of ops) {
        try {
          state = set ? setIn(state, path, value) : removeIn(state, path)
        } catch (err) {
          if (/** @type {any} */ (err).code !== 'INVALID') throw err
        }
      }
      assert.deepEqual(original, before)
      return true
    })
  })
})
