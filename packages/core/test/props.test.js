import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDuration,
  parseBytes,
  parseRate,
  normalizeDistribution,
  quantile,
  mean,
  statistic,
  probit,
  validateValue,
  normalizeValue,
  checkSchema,
  defaultProps,
} from '../src/index.js'

const close = (actual, expected, eps = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(expected)),
    `${actual} ≉ ${expected}`
  )

test('durations parse to milliseconds', () => {
  assert.equal(parseDuration(250), 250)
  assert.equal(parseDuration('250ms'), 250)
  assert.equal(parseDuration('1.5s'), 1500)
  assert.equal(parseDuration('5m'), 300_000)
  assert.equal(parseDuration('5min'), 300_000)
  assert.equal(parseDuration('4d'), 4 * 86_400_000)
  assert.equal(parseDuration('1h30m'), 5_400_000)
  assert.equal(parseDuration(' 1h 30m '), 5_400_000)
  for (const bad of ['', 'fast', '5 parsecs', '1h30', {}])
    assert.throws(() => parseDuration(bad), /Invalid duration/)
})

test('sizes and rates parse to bytes and per-second values', () => {
  assert.equal(parseBytes('512B'), 512)
  assert.equal(parseBytes('10MB'), 10e6)
  assert.equal(parseBytes('1.5 GiB'), 1.5 * 1024 ** 3)
  assert.throws(() => parseBytes('10 bananas'), /Invalid size/)
  assert.equal(parseRate('500/s'), 500)
  assert.equal(parseRate('30 req/min'), 0.5)
  assert.equal(parseRate('3600/h'), 1)
  assert.throws(() => parseRate('fast'), /Invalid rate/)
})

test('distributions normalise and validate', () => {
  assert.deepEqual(normalizeDistribution(5), { kind: 'constant', value: 5 })
  assert.deepEqual(normalizeDistribution({ kind: 'exponential', rate: 4 }), {
    kind: 'exponential',
    mean: 0.25,
  })
  assert.throws(
    () => normalizeDistribution({ kind: 'uniform', min: 5, max: 1 }),
    /min must not exceed max/
  )
  assert.throws(
    () => normalizeDistribution({ kind: 'lognormal', median: 10, p99: 5 }),
    /p99 must be >= median/
  )
  assert.throws(() => normalizeDistribution({ kind: 'weibull' }), /kind must be one of/)
  assert.throws(() => normalizeDistribution({ kind: 'empirical' }), /values' or 'buckets'/)
  assert.throws(
    () =>
      normalizeDistribution({
        kind: 'empirical',
        buckets: [
          { le: 5, count: 1 },
          { le: 3, count: 1 },
        ],
      }),
    /increasing/
  )
})

test('quantiles and means of every distribution kind', () => {
  close(probit(0.5), 0)
  close(probit(0.975), 1.959964, 1e-6)
  close(probit(0.01), -2.326348, 1e-6)
  assert.equal(quantile(7, 0.99), 7)
  assert.equal(quantile({ kind: 'uniform', min: 0, max: 100 }, 0.95), 95)
  close(quantile({ kind: 'normal', mean: 100, sd: 10 }, 0.975), 119.59964, 1e-6)
  close(quantile({ kind: 'exponential', mean: 10 }, 0.5), 10 * Math.log(2))
  const ln = { kind: 'lognormal', median: 5, p99: 40 }
  close(quantile(ln, 0.5), 5)
  close(quantile(ln, 0.99), 40)
  assert.ok(quantile(ln, 0.95) > 5 && quantile(ln, 0.95) < 40)
  assert.equal(quantile({ kind: 'empirical', values: [1, 2, 3, 4, 5] }, 0.5), 3)
  assert.equal(
    quantile(
      {
        kind: 'empirical',
        buckets: [
          { le: 10, count: 50 },
          { le: 20, count: 50 },
        ],
      },
      0.75
    ),
    15
  )
  assert.equal(mean({ kind: 'uniform', min: 2, max: 4 }), 3)
  assert.equal(mean({ kind: 'empirical', values: [1, 2, 6] }), 3)
  assert.equal(
    mean({
      kind: 'empirical',
      buckets: [
        { le: 10, count: 1 },
        { le: 20, count: 1 },
      ],
    }),
    10
  )
  assert.ok(mean(ln) > 5)
})

test('named statistics', () => {
  const ln = { kind: 'lognormal', median: 5, p99: 40 }
  close(statistic(ln, 'p99'), 40)
  close(statistic(ln, 'median'), 5)
  close(statistic({ kind: 'uniform', min: 0, max: 1000 }, 'p999'), 999)
  assert.equal(statistic(ln, 'banana'), undefined)
})

test('values are validated against their property schema', () => {
  validateValue({ type: 'integer', min: 1 }, 5)
  assert.throws(
    () => validateValue({ type: 'integer' }, 1.5, 'q.capacity'),
    /q.capacity must be an integer/
  )
  assert.throws(() => validateValue({ type: 'integer', min: 1 }, 0), />= 1/)
  assert.throws(() => validateValue({ type: 'number', max: 10 }, 11), /<= 10/)
  validateValue({ type: 'duration', min: '1s', max: '1h' }, '30m')
  assert.throws(() => validateValue({ type: 'duration', max: '1h' }, '2h'), /<= 1h/)
  assert.throws(() => validateValue({ type: 'duration' }, 'soon'), /Invalid duration/)
  assert.throws(() => validateValue({ type: 'enum', values: ['a', 'b'] }, 'c'), /one of "a", "b"/)
  assert.throws(() => validateValue({ type: 'percent' }, 101), /between 0 and 100/)
  validateValue({ type: 'list', items: { type: 'string' } }, ['a'])
  assert.throws(
    () => validateValue({ type: 'list', items: { type: 'string' } }, ['a', 1]),
    /\[1\] must be a string/
  )
  validateValue({ type: 'map', values: { type: 'number' } }, { a: 1 })
  assert.throws(
    () => validateValue({ type: 'map', values: { type: 'number' } }, { a: 'x' }),
    /value.a must be a number/
  )
  validateValue({ type: 'distribution' }, { kind: 'normal', mean: 1, sd: 0.1 })
  assert.throws(() => validateValue({ type: 'mystery' }, 1), /unknown property type/)
})

test('normalised values use canonical units', () => {
  assert.equal(normalizeValue({ type: 'duration' }, '4d'), 345_600_000)
  assert.equal(normalizeValue({ type: 'bytes' }, '1KiB'), 1024)
  assert.equal(normalizeValue({ type: 'rate' }, '60/min'), 1)
  assert.deepEqual(normalizeValue({ type: 'distribution' }, 3), { kind: 'constant', value: 3 })
  assert.equal(normalizeValue({ type: 'string' }, 'x'), 'x')
  assert.equal(normalizeValue(undefined, 'x'), 'x')
})

test('schemas are checked, including their defaults', () => {
  assert.deepEqual(checkSchema({ type: 'integer', default: 3, rollup: 'sum' }, 'p'), [])
  assert.deepEqual(checkSchema({ type: 'wat' }, 'p').length, 1)
  assert.match(checkSchema({ type: 'enum' }, 'p')[0], /values must list/)
  assert.match(
    checkSchema({ type: 'integer', default: 'x' }, 'p')[0],
    /p.default must be an integer/
  )
  assert.match(checkSchema({ type: 'number', rollup: 'average' }, 'p')[0], /rollup must be one of/)
  assert.match(checkSchema({ type: 'duration', min: 'soon' }, 'p')[0], /p.min/)
  assert.deepEqual(defaultProps({ a: { type: 'number', default: 1 }, b: { type: 'string' } }), {
    a: 1,
  })
})
