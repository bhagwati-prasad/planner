// @ts-check
/**
 * The in-house schema validator (eng §8): checks a property or state value against the schema
 * a manifest declares. It returns `ok(value)` with the value in canonical units, or
 * `err(code, { path, message })` instead of throwing (eng §14). `path` leads from the value's
 * name to the part that failed, such as 'messages[3].id'; `message` explains it to developers.
 *
 * Property types (spec §8) take unit-bearing values as canonical numbers (milliseconds, bytes,
 * per second) or in the author's notation ('4d', '512 KB', '30 req/min'); sizes are decimal
 * (1 KB = 1,000 bytes, eng §8) unless binary (KiB). State types (spec §6) add queue and table;
 * list and map are both. A list or queue names its items with `items`, a map its values with
 * `values`, as a schema, or either with `of`: a type name, or a record type passed in
 * `options.types` (such as 'message').
 */
import { isPlainObject } from './plain.js'
import { err, ok } from './result.js'
import { decimal, durationMs, perSecond, sizeBytes } from './units.js'

export const PROPERTY_TYPES = Object.freeze([
  'number',
  'integer',
  'boolean',
  'string',
  'enum',
  'duration',
  'bytes',
  'rate',
  'percent',
  'distribution',
  'list',
  'map',
  'ref',
])

/** State types are the property types plus queue and table (spec §6). */
export const STATE_TYPES = Object.freeze([...PROPERTY_TYPES, 'queue', 'table'])

export const DISTRIBUTION_KINDS = Object.freeze([
  'constant',
  'uniform',
  'normal',
  'exponential',
  'lognormal',
  'empirical',
])

/** The parameters each distribution kind takes (an exponential takes a mean or a rate). */
const DISTRIBUTION_PARAMS = {
  constant: ['value'],
  uniform: ['min', 'max'],
  normal: ['mean', 'sd'],
  exponential: ['mean', 'rate'],
  lognormal: ['median', 'p99'],
  empirical: ['values', 'buckets'],
}

/** How each unit-bearing type parses, and how to describe a value that does not. */
const UNIT_TYPES = {
  duration: { parse: durationMs, noun: 'duration', hint: '250ms, 30s, 5m, 4d, 1h30m' },
  bytes: { parse: sizeBytes, noun: 'size', hint: '512B, 10MB, 1.5GiB' },
  rate: { parse: perSecond, noun: 'rate', hint: '500/s, 30 req/min' },
}

/**
 * Why a unit-bearing value does not parse, for developers.
 * @param {'duration'|'bytes'|'rate'} type
 * @param {unknown} value
 */
export function unitProblem(type, value) {
  const { noun, hint } = UNIT_TYPES[type]
  return `Invalid ${noun} ${JSON.stringify(value)} (use e.g. ${hint})`
}

/** @param {string} path @param {string} message */
const badDistribution = (path, message) => err('E_SCHEMA_DISTRIBUTION', { path, message })

/**
 * The first numeric parameter that is missing, not finite or breaks its rule ('>0' or '>=0').
 * @param {Record<string, unknown>} d
 * @param {string} path
 * @param {Record<string, ''|'>0'|'>=0'>} rules
 */
function badParameter(d, path, rules) {
  for (const [key, rule] of Object.entries(rules)) {
    const v = d[key]
    const at = `${path}.${key}`
    if (typeof v !== 'number' || !Number.isFinite(v))
      return badDistribution(at, `${at} must be a finite number`)
    if (rule === '>0' && !(v > 0)) return badDistribution(at, `${at} must be > 0`)
    if (rule === '>=0' && !(v >= 0)) return badDistribution(at, `${at} must be >= 0`)
  }
  return null
}

/**
 * Checks a distribution and returns its normalised object form: a bare number is a constant,
 * an exponential's rate becomes its mean.
 * @param {unknown} value
 * @param {string} [path]
 */
export function checkDistribution(value, path = 'distribution') {
  if (typeof value === 'number')
    return Number.isFinite(value)
      ? ok({ kind: 'constant', value })
      : badDistribution(path, `${path} must be finite`)
  if (!isPlainObject(value))
    return badDistribution(path, `${path} must be a number or a distribution object`)
  const d = /** @type {Record<string, any>} */ (value)
  const params = DISTRIBUTION_PARAMS[/** @type {keyof typeof DISTRIBUTION_PARAMS} */ (d.kind)]
  if (!params)
    return badDistribution(
      `${path}.kind`,
      `${path}.kind must be one of ${DISTRIBUTION_KINDS.join(', ')}`
    )
  const stray = Object.keys(d).find(key => key !== 'kind' && !params.includes(key))
  if (stray)
    return badDistribution(
      `${path}.${stray}`,
      `${path}.${stray} is not a parameter of a ${d.kind} distribution (it takes ${params.join(' and ')})`
    )
  switch (d.kind) {
    case 'constant':
      return badParameter(d, path, { value: '' }) ?? ok({ kind: 'constant', value: d.value })
    case 'uniform':
      return (
        badParameter(d, path, { min: '', max: '' }) ??
        (d.min > d.max
          ? badDistribution(`${path}.max`, `${path}: min must not exceed max`)
          : ok({ kind: 'uniform', min: d.min, max: d.max }))
      )
    case 'normal':
      return (
        badParameter(d, path, { mean: '', sd: '>=0' }) ??
        ok({ kind: 'normal', mean: d.mean, sd: d.sd })
      )
    case 'exponential':
      if (d.rate !== undefined && d.mean === undefined)
        return (
          badParameter(d, path, { rate: '>0' }) ?? ok({ kind: 'exponential', mean: 1 / d.rate })
        )
      return badParameter(d, path, { mean: '>0' }) ?? ok({ kind: 'exponential', mean: d.mean })
    case 'lognormal':
      return (
        badParameter(d, path, { median: '>0', p99: '>0' }) ??
        (d.p99 < d.median
          ? badDistribution(`${path}.p99`, `${path}: p99 must be >= median`)
          : ok({ kind: 'lognormal', median: d.median, p99: d.p99 }))
      )
    default:
      return checkEmpirical(d, path)
  }
}

/** @param {Record<string, any>} d @param {string} path */
function checkEmpirical(d, path) {
  if (Array.isArray(d.values)) {
    if (!d.values.length || d.values.some(v => typeof v !== 'number' || !Number.isFinite(v)))
      return badDistribution(`${path}.values`, `${path}.values must be a non-empty list of numbers`)
    return ok({ kind: 'empirical', values: [...d.values] })
  }
  if (Array.isArray(d.buckets)) {
    let prev = -Infinity
    let total = 0
    for (const [i, b] of d.buckets.entries()) {
      if (
        !isPlainObject(b) ||
        typeof b.le !== 'number' ||
        typeof b.count !== 'number' ||
        b.count < 0 ||
        !(b.le > prev)
      )
        return badDistribution(
          `${path}.buckets[${i}]`,
          `${path}.buckets[${i}] must be { le, count } with increasing le and count >= 0`
        )
      prev = b.le
      total += b.count
    }
    if (total <= 0)
      return badDistribution(
        `${path}.buckets`,
        `${path}.buckets must contain at least one observation`
      )
    return ok({ kind: 'empirical', buckets: d.buckets.map(b => ({ le: b.le, count: b.count })) })
  }
  return badDistribution(path, `${path}: an empirical distribution needs 'values' or 'buckets'`)
}

/** @param {string} path @param {string} message */
const badType = (path, message) => err('E_SCHEMA_TYPE', { path, message })

/**
 * A number within the schema's min and max, which are in the schema's own notation (a
 * duration's min may be '1s').
 * @param {Schema} schema
 * @param {number} n       the value in canonical units
 * @param {unknown} value  the value as given
 * @param {string} path
 */
function inRange(schema, n, value, path) {
  const bound = /** @param {'min'|'max'} key */ key =>
    schema[key] === undefined
      ? undefined
      : (UNIT_TYPES[/** @type {keyof typeof UNIT_TYPES} */ (schema.type)]?.parse ?? Number)(
          schema[key]
        )
  const min = bound('min')
  const max = bound('max')
  if (min !== undefined && n < min)
    return err('E_SCHEMA_RANGE', {
      path,
      message: `${path} must be >= ${schema.min}, got ${JSON.stringify(value)}`,
    })
  if (max !== undefined && n > max)
    return err('E_SCHEMA_RANGE', {
      path,
      message: `${path} must be <= ${schema.max}, got ${JSON.stringify(value)}`,
    })
  return ok(n)
}

/**
 * The schema a collection's `of` names: a schema itself, a type name, or a record type.
 * @param {string|Schema|undefined} of
 * @param {Record<string, Schema>} types
 * @returns {Schema|undefined}
 */
function itemSchema(of, types) {
  if (typeof of !== 'string') return of
  return STATE_TYPES.includes(of) ? { type: of } : (types[of] ?? { type: of })
}

/**
 * Checks each item of a list or queue.
 * @param {unknown[]} items
 * @param {Schema|undefined} schema
 * @param {string} path
 * @param {CheckOptions} options
 */
function checkItems(items, schema, path, options) {
  if (!schema) return ok([...items])
  const out = []
  for (const [i, item] of items.entries()) {
    const result = checkValue(schema, item, `${path}[${i}]`, options)
    if (!result.ok) return result
    out.push(result.value)
  }
  return ok(out)
}

/**
 * Checks each row of a table: an object with exactly the declared columns, and a key column
 * whose values are unique.
 * @param {unknown[]} rows
 * @param {Schema} schema
 * @param {string} path
 * @param {CheckOptions} options
 */
function checkRows(rows, schema, path, options) {
  const columns = schema.columns ?? {}
  const key = schema.key ?? ('id' in columns ? 'id' : undefined)
  const seen = new Set()
  const out = []
  for (const [i, row] of rows.entries()) {
    const at = `${path}[${i}]`
    if (!isPlainObject(row)) return badType(at, `${at} must be a row object`)
    const r = /** @type {Record<string, unknown>} */ (row)
    /** @type {Record<string, unknown>} */
    const checked = {}
    for (const [column, columnSchema] of Object.entries(columns)) {
      if (!(column in r))
        return err('E_SCHEMA_FIELD', {
          path: `${at}.${column}`,
          message: `${at}.${column} is missing`,
        })
      const result = checkValue(columnSchema, r[column], `${at}.${column}`, options)
      if (!result.ok) return result
      checked[column] = result.value
    }
    const extra = Object.keys(r).find(column => !(column in columns))
    if (extra)
      return err('E_SCHEMA_FIELD', {
        path: `${at}.${extra}`,
        message: `${at}.${extra} is not a column of the table`,
      })
    if (key !== undefined) {
      if (seen.has(checked[key]))
        return err('E_SCHEMA_KEY', {
          path: `${at}.${key}`,
          message: `${at}.${key} repeats the key ${JSON.stringify(checked[key])}`,
        })
      seen.add(checked[key])
    }
    out.push(checked)
  }
  return ok(out)
}

/**
 * Checks a value against a property or state schema.
 * @param {Schema} schema
 * @param {unknown} value
 * @param {string} [path]  the value's name, where error paths start
 * @param {CheckOptions} [options]
 * @returns {import('./result.js').Ok<any> | import('./result.js').Err}
 */
export function checkValue(schema, value, path = 'value', options = {}) {
  const types = options.types ?? {}
  switch (schema.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        return badType(path, `${path} must be a number`)
      return inRange(schema, value, value, path)
    case 'integer':
      if (!Number.isInteger(value)) return badType(path, `${path} must be an integer`)
      return inRange(schema, /** @type {number} */ (value), value, path)
    case 'boolean':
      return typeof value === 'boolean' ? ok(value) : badType(path, `${path} must be true or false`)
    case 'string':
      return typeof value === 'string' ? ok(value) : badType(path, `${path} must be a string`)
    case 'enum': {
      const choices = Array.isArray(schema.values) ? schema.values : []
      return choices.includes(value)
        ? ok(value)
        : err('E_SCHEMA_ENUM', {
            path,
            message: `${path} must be one of ${choices.map(v => JSON.stringify(v)).join(', ')}`,
          })
    }
    case 'duration':
    case 'bytes':
    case 'rate': {
      const n = UNIT_TYPES[schema.type].parse(value)
      if (n === undefined)
        return err('E_SCHEMA_UNIT', {
          path,
          message: `${path}: ${unitProblem(schema.type, value)}`,
        })
      return inRange(schema, n, value, path)
    }
    case 'percent': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return badType(path, `${path} must be a percentage number`)
      const min = Number(schema.min ?? 0)
      const max = Number(schema.max ?? 100)
      if (value < min || value > max)
        return err('E_SCHEMA_RANGE', { path, message: `${path} must be between ${min} and ${max}` })
      // Written in percentage points; stored as a fraction (eng §8).
      return ok(Number(decimal(value, -2)))
    }
    case 'distribution':
      return checkDistribution(value, path)
    case 'list':
    case 'queue':
      if (!Array.isArray(value)) return badType(path, `${path} must be a list`)
      return checkItems(value, itemSchema(schema.items ?? schema.of, types), path, options)
    case 'map': {
      if (!isPlainObject(value)) return badType(path, `${path} must be an object`)
      const values = isPlainObject(schema.values)
        ? /** @type {Schema} */ (schema.values)
        : itemSchema(schema.of, types)
      /** @type {Record<string, unknown>} */
      const out = {}
      for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
        const result = values ? checkValue(values, v, `${path}.${k}`, options) : ok(v)
        if (!result.ok) return result
        out[k] = result.value
      }
      return ok(out)
    }
    case 'ref':
      return typeof value === 'string' && value
        ? ok(value)
        : badType(path, `${path} must be a node id`)
    case 'table':
      if (!Array.isArray(value)) return badType(path, `${path} must be a list of rows`)
      return checkRows(value, schema, path, options)
    default:
      return err('E_SCHEMA_UNKNOWN_TYPE', {
        path,
        message: `${path} has unknown property type '${schema.type}'`,
      })
  }
}

/**
 * @typedef {object} Schema  a property or state schema (spec §6, §8)
 * @property {string} type
 * @property {string} [unit]
 * @property {unknown} [default]    a property's default
 * @property {unknown} [initial]    a state field's initial value
 * @property {number|string} [min]  in the type's own notation
 * @property {number|string} [max]
 * @property {unknown} [values]     an enum's options, or the schema of a map's values
 * @property {Schema} [items]       the schema of a list's items
 * @property {string|Schema} [of]   a list's, queue's or map's item type
 * @property {Record<string, Schema>} [columns]  a table's columns
 * @property {string} [key]         a table's key column (default 'id' when there is one)
 * @property {string} [group]
 * @property {string} [description]
 * @property {string|{rule: string}} [rollup]
 *
 * @typedef {object} CheckOptions
 * @property {Record<string, Schema>} [types]  record types that `of` may name, such as 'message'
 */
