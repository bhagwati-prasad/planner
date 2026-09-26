import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createUlidFactory,
  isUlid,
  ulidTime,
  createPrng,
  Emitter,
  toPlain,
  deepFreeze,
  deepEqual,
  thaw,
  compareSemver,
  satisfies,
  isSemver,
  suggest,
  StrataError,
} from '../src/index.js'
import { T0 } from './helpers.js'

test('ULIDs encode time, sort in creation order and stay monotonic within a millisecond', () => {
  let now = T0
  const prng = createPrng(7)
  const ulid = createUlidFactory({ now: () => now, random: n => prng.bytes(n) })
  const a = ulid()
  const b = ulid()
  now += 5
  const c = ulid()
  now -= 100 // clock moves backwards
  const d = ulid()
  for (const id of [a, b, c, d]) assert.ok(isUlid(id), id)
  assert.equal(ulidTime(a), T0)
  assert.equal(ulidTime(c), T0 + 5)
  assert.deepEqual([d, c, b, a].sort(), [a, b, c, d])
  assert.equal(new Set([a, b, c, d]).size, 4)
})

test('ULID factories with the same seed produce the same ids', () => {
  const make = () => {
    const prng = createPrng('seed')
    const ulid = createUlidFactory({ now: () => T0, random: n => prng.bytes(n) })
    return [ulid(), ulid(), ulid()]
  }
  assert.deepEqual(make(), make())
  assert.equal(isUlid('not-a-ulid'), false)
  assert.throws(() => ulidTime('nope'), StrataError)
})

test('seeded PRNG is deterministic and derived streams are independent', () => {
  const a = createPrng(42)
  const b = createPrng(42)
  const seqA = Array.from({ length: 5 }, () => a.next())
  const seqB = Array.from({ length: 5 }, () => b.next())
  assert.deepEqual(seqA, seqB)
  for (const x of seqA) assert.ok(x >= 0 && x < 1)
  const d1 = createPrng(1).derive('node-a').next()
  const d2 = createPrng(1).derive('node-b').next()
  assert.notEqual(d1, d2)
})

test('emitter delivers events, supports wildcard, once and unsubscribe', () => {
  const e = new Emitter()
  const seen = []
  const off = e.on('x', v => seen.push(['x', v]))
  e.on('*', (name, v) => seen.push(['*', name, v]))
  e.once('y', v => seen.push(['once', v]))
  e.emit('x', 1)
  e.emit('y', 2)
  e.emit('y', 3)
  off()
  e.emit('x', 4)
  assert.deepEqual(seen, [
    ['x', 1],
    ['*', 'x', 1],
    ['once', 2],
    ['*', 'y', 2],
    ['*', 'y', 3],
    ['*', 'x', 4],
  ])
})

test('a throwing listener does not stop other listeners', () => {
  const errors = []
  const e = new Emitter({ onError: (err, event) => errors.push([event, err.message]) })
  let reached = false
  e.on('x', () => {
    throw new Error('boom')
  })
  e.on('x', () => {
    reached = true
  })
  e.emit('x')
  assert.equal(reached, true)
  assert.deepEqual(errors, [['x', 'boom']])
})

test('toPlain clones JSON data and rejects values commands cannot carry', () => {
  const src = { a: 1, b: [1, { c: 'x' }], d: undefined, e: null }
  const out = toPlain(src)
  assert.deepEqual(out, { a: 1, b: [1, { c: 'x' }], e: null })
  assert.notEqual(out.b, src.b)
  assert.throws(() => toPlain({ f: () => 1 }), /function/)
  assert.throws(() => toPlain({ d: new Date() }), /Date/)
  assert.throws(() => toPlain({ n: NaN }), /finite/)
  assert.throws(() => toPlain([1, undefined]), /undefined/)
  const cyc = {}
  cyc.self = cyc
  assert.throws(() => toPlain(cyc), /circular/)
})

test('deepFreeze, deepEqual and thaw', () => {
  const v = deepFreeze({ a: { b: [1, 2] } })
  assert.ok(Object.isFrozen(v.a.b))
  assert.ok(deepEqual(v, { a: { b: [1, 2] } }))
  assert.ok(!deepEqual(v, { a: { b: [1, 3] } }))
  assert.ok(!deepEqual({ a: 1 }, { a: 1, b: 2 }))
  const t = thaw(v)
  t.a.b.push(3)
  assert.deepEqual(v.a.b, [1, 2])
})

test('semver comparison and ranges', () => {
  assert.ok(isSemver('1.2.0'))
  assert.ok(!isSemver('1.2'))
  assert.ok(compareSemver('1.10.0', '1.9.0') > 0)
  assert.ok(compareSemver('1.0.0-beta', '1.0.0') < 0)
  assert.ok(satisfies('1.2.0', '^1.0'))
  assert.ok(!satisfies('2.0.0', '^1.0'))
  assert.ok(satisfies('0.2.5', '^0.2'))
  assert.ok(!satisfies('0.3.0', '^0.2'))
  assert.ok(satisfies('1.2.9', '~1.2.3'))
  assert.ok(!satisfies('1.3.0', '~1.2.3'))
  assert.ok(satisfies('1.2.3', '1.2.3'))
  assert.ok(satisfies('5.0.0', '*'))
})

test('suggest finds near matches', () => {
  assert.deepEqual(suggest('rateLimt', ['rateLimit', 'retries', 'timeout']), ['rateLimit'])
  assert.deepEqual(suggest('zzz', ['rateLimit']), [])
})
