import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../src/index.js'

const MESSAGE = { type: 'map', values: { type: 'string' } }

/**
 * For every property and state type: a schema, values it accepts, and values it rejects as
 * [value, code, path]. Values are checked at the path 'p'.
 */
const TYPES = {
  number: {
    schema: { type: 'number', unit: 'req/s', min: 0, max: 1000 },
    valid: [0, 12.5, 1000],
    invalid: [
      ['fast', 'E_SCHEMA_TYPE', 'p'],
      [null, 'E_SCHEMA_TYPE', 'p'],
      [1001, 'E_SCHEMA_RANGE', 'p'],
      [-1, 'E_SCHEMA_RANGE', 'p'],
    ],
  },
  integer: {
    schema: { type: 'integer', unit: 'messages', min: 1 },
    valid: [1, 100000],
    invalid: [
      [1.5, 'E_SCHEMA_TYPE', 'p'],
      ['3', 'E_SCHEMA_TYPE', 'p'],
      [0, 'E_SCHEMA_RANGE', 'p'],
    ],
  },
  boolean: {
    schema: { type: 'boolean' },
    valid: [true, false],
    invalid: [
      ['yes', 'E_SCHEMA_TYPE', 'p'],
      [0, 'E_SCHEMA_TYPE', 'p'],
    ],
  },
  string: {
    schema: { type: 'string' },
    valid: ['', 'PostgreSQL 16'],
    invalid: [
      [5, 'E_SCHEMA_TYPE', 'p'],
      [null, 'E_SCHEMA_TYPE', 'p'],
    ],
  },
  enum: {
    schema: { type: 'enum', values: ['reject', 'drop-oldest', 'block'] },
    valid: ['reject', 'block'],
    invalid: [
      ['drop', 'E_SCHEMA_ENUM', 'p'],
      [1, 'E_SCHEMA_ENUM', 'p'],
    ],
  },
  duration: {
    schema: { type: 'duration', min: '1s', max: '7d' },
    valid: ['4d', '30s', '1h30m', 1000],
    invalid: [
      ['soon', 'E_SCHEMA_UNIT', 'p'],
      [true, 'E_SCHEMA_UNIT', 'p'],
      ['500ms', 'E_SCHEMA_RANGE', 'p'],
      ['8d', 'E_SCHEMA_RANGE', 'p'],
    ],
  },
  bytes: {
    schema: { type: 'bytes', max: '1 GB' },
    valid: ['512 KB', '4KB', '1GB', 0],
    invalid: [
      ['big', 'E_SCHEMA_UNIT', 'p'],
      ['2 GB', 'E_SCHEMA_RANGE', 'p'],
    ],
  },
  rate: {
    schema: { type: 'rate', unit: 'req/s' },
    valid: ['500/s', '30 req/min', 12],
    invalid: [
      ['fast', 'E_SCHEMA_UNIT', 'p'],
      [[5], 'E_SCHEMA_UNIT', 'p'],
    ],
  },
  percent: {
    schema: { type: 'percent', unit: '%' },
    valid: [0, 99.9, 100],
    invalid: [
      ['high', 'E_SCHEMA_TYPE', 'p'],
      [101, 'E_SCHEMA_RANGE', 'p'],
    ],
  },
  distribution: {
    schema: { type: 'distribution', unit: 'ms' },
    valid: [5, { kind: 'lognormal', median: 5, p99: 40 }],
    invalid: [
      ['slow', 'E_SCHEMA_DISTRIBUTION', 'p'],
      [{ kind: 'lognormal', median: 5 }, 'E_SCHEMA_DISTRIBUTION', 'p.p99'],
    ],
  },
  list: {
    schema: { type: 'list', items: { type: 'duration' } },
    valid: [[], ['1s', 200]],
    invalid: [
      ['1s', 'E_SCHEMA_TYPE', 'p'],
      [['1s', 'soon'], 'E_SCHEMA_UNIT', 'p[1]'],
    ],
  },
  map: {
    schema: { type: 'map', values: { type: 'integer' } },
    valid: [{}, { a: 1, b: 2 }],
    invalid: [
      [[1], 'E_SCHEMA_TYPE', 'p'],
      [{ a: 1, b: 'x' }, 'E_SCHEMA_TYPE', 'p.b'],
    ],
  },
  ref: {
    schema: { type: 'ref' },
    valid: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    invalid: [
      ['', 'E_SCHEMA_TYPE', 'p'],
      [5, 'E_SCHEMA_TYPE', 'p'],
    ],
  },
  queue: {
    schema: { type: 'queue', of: 'message', initial: [] },
    options: { types: { message: MESSAGE } },
    valid: [[], [{ id: 'm1' }, { id: 'm2' }]],
    invalid: [
      [{}, 'E_SCHEMA_TYPE', 'p'],
      [[{ id: 'm1' }, { id: 3 }], 'E_SCHEMA_TYPE', 'p[1].id'],
    ],
  },
  table: {
    schema: {
      type: 'table',
      key: 'sku',
      columns: { sku: { type: 'string' }, qty: { type: 'integer', min: 0 } },
      initial: [],
    },
    valid: [
      [],
      [
        { sku: 'a', qty: 1 },
        { sku: 'b', qty: 0 },
      ],
    ],
    invalid: [
      [{}, 'E_SCHEMA_TYPE', 'p'],
      [['row'], 'E_SCHEMA_TYPE', 'p[0]'],
      [[{ sku: 'a', qty: -1 }], 'E_SCHEMA_RANGE', 'p[0].qty'],
      [[{ sku: 'a' }], 'E_SCHEMA_FIELD', 'p[0].qty'],
      [[{ sku: 'a', qty: 1, colour: 'red' }], 'E_SCHEMA_FIELD', 'p[0].colour'],
      [
        [
          { sku: 'a', qty: 1 },
          { sku: 'a', qty: 2 },
        ],
        'E_SCHEMA_KEY',
        'p[1].sku',
      ],
    ],
  },
}

/** State lists and maps name their item type with `of`, a type or a named record type. */
const STATE_FORMS = [
  {
    schema: { type: 'list', of: 'integer', initial: [] },
    valid: [[1, 2]],
    invalid: [[[1, 'x'], 'E_SCHEMA_TYPE', 'p[1]']],
  },
  {
    schema: { type: 'map', of: 'message', initial: {} },
    options: { types: { message: MESSAGE } },
    valid: [{ m1: { id: 'm1' } }],
    invalid: [[{ m1: { id: 1 } }, 'E_SCHEMA_TYPE', 'p.m1.id']],
  },
  {
    schema: { type: 'queue', of: 'parcel', initial: [] },
    valid: [[]],
    invalid: [[[{}], 'E_SCHEMA_UNKNOWN_TYPE', 'p[0]']],
  },
  { schema: { type: 'mystery' }, valid: [], invalid: [[1, 'E_SCHEMA_UNKNOWN_TYPE', 'p']] },
]

/** For every distribution kind: parameters it accepts, and ones it rejects as [value, path]. */
const DISTRIBUTIONS = {
  constant: {
    valid: [{ kind: 'constant', value: 3 }, 3],
    invalid: [
      [{ kind: 'constant' }, 'd.value'],
      [{ kind: 'constant', value: 'x' }, 'd.value'],
    ],
  },
  uniform: {
    valid: [{ kind: 'uniform', min: 1, max: 5 }],
    invalid: [
      [{ kind: 'uniform', min: 1 }, 'd.max'],
      [{ kind: 'uniform', min: 5, max: 1 }, 'd.max'],
    ],
  },
  normal: {
    valid: [{ kind: 'normal', mean: 10, sd: 2 }],
    invalid: [
      [{ kind: 'normal', sd: 1 }, 'd.mean'],
      [{ kind: 'normal', mean: 10, sd: -1 }, 'd.sd'],
      [{ kind: 'normal', mean: 10, sd: 1, skew: 2 }, 'd.skew'],
    ],
  },
  exponential: {
    valid: [
      { kind: 'exponential', mean: 4 },
      { kind: 'exponential', rate: 0.25 },
    ],
    invalid: [
      [{ kind: 'exponential', mean: 0 }, 'd.mean'],
      [{ kind: 'exponential', rate: -1 }, 'd.rate'],
    ],
  },
  lognormal: {
    valid: [{ kind: 'lognormal', median: 5, p99: 40 }],
    invalid: [
      [{ kind: 'lognormal', median: 0, p99: 4 }, 'd.median'],
      [{ kind: 'lognormal', median: 5, p99: 4 }, 'd.p99'],
      [{ kind: 'lognormal', median: 5, p95: 40 }, 'd.p95'],
    ],
  },
  empirical: {
    valid: [
      { kind: 'empirical', values: [1, 2, 3] },
      {
        kind: 'empirical',
        buckets: [
          { le: 10, count: 5 },
          { le: 20, count: 1 },
        ],
      },
    ],
    invalid: [
      [{ kind: 'empirical' }, 'd'],
      [{ kind: 'empirical', values: [] }, 'd.values'],
      [{ kind: 'empirical', values: [1, 'x'] }, 'd.values'],
      [
        {
          kind: 'empirical',
          buckets: [
            { le: 10, count: 1 },
            { le: 5, count: 1 },
          ],
        },
        'd.buckets[1]',
      ],
      [{ kind: 'empirical', buckets: [{ le: 1, count: 0 }] }, 'd.buckets'],
    ],
  },
}

/** @param {{ schema: object, options?: object, valid: unknown[], invalid: [unknown, string, string][] }} spec */
function check({ schema, options, valid, invalid }, label) {
  for (const value of valid) {
    const result = core.checkValue(schema, value, 'p', options)
    assert.equal(
      result.ok,
      true,
      `${label} accepts ${JSON.stringify(value)}: ${JSON.stringify(result)}`
    )
  }
  for (const [value, code, path] of invalid) {
    const result = core.checkValue(schema, value, 'p', options)
    assert.equal(result.ok, false, `${label} rejects ${JSON.stringify(value)}`)
    assert.equal(result.code, code, `${label} rejects ${JSON.stringify(value)} with ${code}`)
    assert.equal(result.details.path, path, `${label} names the path to ${JSON.stringify(value)}`)
  }
}

describe('schema validator', () => {
  it('every property and state type accepts valid values and rejects invalid ones with a path to the error', () => {
    assert.deepEqual(
      core.STATE_TYPES,
      [...core.PROPERTY_TYPES, 'queue', 'table'],
      'state types are the property types plus queue and table (list and map are both)'
    )
    assert.deepEqual(
      core.STATE_TYPES.filter(type => !(type in TYPES)),
      [],
      'every type has cases'
    )
    for (const [type, spec] of Object.entries(TYPES)) check(spec, type)
    for (const spec of STATE_FORMS) check(spec, JSON.stringify(spec.schema))
  })

  it('"4d" parses to milliseconds and "512 KB" to bytes', () => {
    assert.deepEqual(core.checkValue({ type: 'duration' }, '4d'), { ok: true, value: 345_600_000 })
    assert.deepEqual(core.checkValue({ type: 'bytes' }, '512 KB'), { ok: true, value: 512_000 })
    assert.deepEqual(core.checkValue({ type: 'bytes' }, '1.5 GiB').value, 1.5 * 1024 ** 3)
    assert.deepEqual(core.checkValue({ type: 'rate' }, '30 req/min').value, 0.5)
    assert.deepEqual(
      core.checkValue({ type: 'map', values: { type: 'duration' } }, { a: '1h30m', b: 250 }).value,
      { a: 5_400_000, b: 250 },
      'values inside lists, maps, queues and tables come back in canonical units'
    )
  })

  it('every distribution kind validates its parameters', () => {
    assert.deepEqual(
      core.DISTRIBUTION_KINDS.filter(kind => !(kind in DISTRIBUTIONS)),
      [],
      'every kind has cases'
    )
    for (const [kind, { valid, invalid }] of Object.entries(DISTRIBUTIONS)) {
      for (const value of valid) {
        const result = core.checkValue({ type: 'distribution' }, value, 'd')
        assert.equal(result.ok, true, `${kind} accepts ${JSON.stringify(value)}`)
        assert.equal(result.value.kind, kind, 'and returns its normalised form')
      }
      for (const [value, path] of invalid) {
        const result = core.checkValue({ type: 'distribution' }, value, 'd')
        assert.equal(
          result.code,
          'E_SCHEMA_DISTRIBUTION',
          `${kind} rejects ${JSON.stringify(value)}`
        )
        assert.equal(result.details.path, path, `${kind}: the path to ${JSON.stringify(value)}`)
      }
    }
    const unknown = core.checkValue({ type: 'distribution' }, { kind: 'weibull' }, 'd')
    assert.equal(unknown.details.path, 'd.kind')
  })
})
