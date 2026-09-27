/**
 * Property schemas and values (spec §7 "Manifest"): the types a component manifest may declare,
 * parsing of unit-bearing values (durations, sizes, rates), distributions, validation, defaults
 * and effective values.
 *
 * Property values are stored in canonical units (ADR 0008): commands and the registry convert
 * what authors write ("4d", "10MB", 99.9 percent) with the schema validator (schema.js), so
 * readers such as roll-ups and the simulation use them as they are.
 */
import { fail } from './errors.js'
import { isPlainObject } from './plain.js'
import {
  DISTRIBUTION_KINDS,
  PROPERTY_TYPES,
  checkDistribution,
  checkValue,
  unitProblem,
} from './schema.js'
import { durationMs, perSecond, sizeBytes } from './units.js'

export { DISTRIBUTION_KINDS, PROPERTY_TYPES }

/** Aggregation rules from spec §6 "Data roll-up", plus plain min and max (§7). */
export const ROLLUP_RULES = Object.freeze([
  'sum',
  'min',
  'max',
  'min-path',
  'critical-path',
  'worst',
  'product',
  'union',
  'count',
])

/**
 * The value of a check, or its failure thrown as a StrataError with the check's code, message
 * and details.
 * @param {import('./result.js').Ok<any> | import('./result.js').Err} result
 */
function orThrow(result) {
  if (result.ok === false)
    fail(result.code, /** @type {string} */ (result.details.message), result.details)
  return result.value
}

/**
 * Parses a duration to milliseconds: a number (already ms) or strings like "250ms", "1.5s",
 * "4d" and "1h30m".
 * @param {number|string} value
 * @returns {number}
 */
export function parseDuration(value) {
  const ms = durationMs(value)
  return ms ?? fail('E_SCHEMA_UNIT', unitProblem('duration', value), { value })
}

/**
 * Parses a size to bytes: a number (already bytes) or "512B", "10MB", "1.5GiB".
 * @param {number|string} value
 */
export function parseBytes(value) {
  const bytes = sizeBytes(value)
  return bytes ?? fail('E_SCHEMA_UNIT', unitProblem('bytes', value), { value })
}

/**
 * Parses a rate to events per second: a number (already per second) or "500/s", "30 req/min".
 * @param {number|string} value
 */
export function parseRate(value) {
  const rate = perSecond(value)
  return rate ?? fail('E_SCHEMA_UNIT', unitProblem('rate', value), { value })
}

/**
 * Validates a distribution and returns its normalised object form.
 * @param {unknown} value
 * @param {string} [label]
 */
export function normalizeDistribution(value, label = 'distribution') {
  return orThrow(checkDistribution(value, label))
}

/**
 * Inverse of the standard normal CDF (Acklam's approximation, |error| < 1.2e-9).
 * @param {number} p in (0, 1)
 */
export function probit(p) {
  if (!(p > 0 && p < 1)) fail('INVALID', `probit is defined on (0, 1), got ${p}`)
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  if (p > 1 - low) return -probit(1 - p)
  const q = p - 0.5
  const r = q * q
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

const Z99 = probit(0.99)

/**
 * The q-quantile of a distribution.
 * @param {unknown} dist
 * @param {number} q in [0, 1]
 */
export function quantile(dist, q) {
  const d = normalizeDistribution(dist)
  if (!(q >= 0 && q <= 1)) fail('INVALID', `Quantile must be in [0, 1], got ${q}`)
  switch (d.kind) {
    case 'constant':
      return d.value
    case 'uniform':
      return d.min + q * (d.max - d.min)
    case 'normal':
      if (q === 0 || q === 1) return q === 0 ? -Infinity : Infinity
      return d.mean + d.sd * probit(q)
    case 'exponential':
      return q === 1 ? Infinity : -d.mean * Math.log(1 - q)
    case 'lognormal': {
      if (q === 0) return 0
      if (q === 1) return Infinity
      if (q === 0.5) return d.median // the declared parameters, exactly
      if (q === 0.99) return d.p99
      const mu = Math.log(d.median)
      const sigma = (Math.log(d.p99) - mu) / Z99
      return Math.exp(mu + sigma * probit(q))
    }
    case 'empirical': {
      if (d.values) {
        const sorted = [...d.values].sort((x, y) => x - y)
        const pos = q * (sorted.length - 1)
        const lo = Math.floor(pos)
        const hi = Math.ceil(pos)
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
      }
      const total = d.buckets.reduce((s, b) => s + b.count, 0)
      const target = q * total
      let cum = 0
      let prevLe = Math.min(0, d.buckets[0].le)
      for (const b of d.buckets) {
        if (b.count > 0 && cum + b.count >= target) {
          return prevLe + (b.le - prevLe) * ((target - cum) / b.count)
        }
        cum += b.count
        prevLe = b.le
      }
      return d.buckets[d.buckets.length - 1].le
    }
  }
}

/**
 * The mean of a distribution.
 * @param {unknown} dist
 */
export function mean(dist) {
  const d = normalizeDistribution(dist)
  switch (d.kind) {
    case 'constant':
      return d.value
    case 'uniform':
      return (d.min + d.max) / 2
    case 'normal':
      return d.mean
    case 'exponential':
      return d.mean
    case 'lognormal': {
      const mu = Math.log(d.median)
      const sigma = (Math.log(d.p99) - mu) / Z99
      return Math.exp(mu + (sigma * sigma) / 2)
    }
    case 'empirical': {
      if (d.values) return d.values.reduce((s, v) => s + v, 0) / d.values.length
      let prevLe = Math.min(0, d.buckets[0].le)
      let sum = 0
      let total = 0
      for (const b of d.buckets) {
        sum += (b.count * (prevLe + b.le)) / 2
        total += b.count
        prevLe = b.le
      }
      return sum / total
    }
  }
}

/**
 * A named statistic of a distribution: 'mean', 'median', 'min', 'max' or a percentile such
 * as 'p50', 'p95', 'p99' or 'p999' (99.9th).
 * @param {unknown} dist
 * @param {string} name
 * @returns {number|undefined}
 */
export function statistic(dist, name) {
  if (name === 'mean') return mean(dist)
  if (name === 'median') return quantile(dist, 0.5)
  if (name === 'min') return quantile(dist, 0)
  if (name === 'max') return quantile(dist, 1)
  const m = /^p(\d{1,4})$/.exec(name)
  if (!m) return undefined
  const digits = m[1]
  const q = digits.length <= 2 ? Number(digits) / 100 : Number(`0.${digits}`)
  return quantile(dist, q)
}

function normalizeScalar(type, value) {
  switch (type) {
    case 'duration':
      return parseDuration(value)
    case 'bytes':
      return parseBytes(value)
    case 'rate':
      return parseRate(value)
    default:
      return value
  }
}

/**
 * Validates one value against a property schema and returns it in canonical units; throws a
 * StrataError with the E_SCHEMA_ code and path `checkValue` reports.
 * @param {PropertySchema} schema
 * @param {unknown} value
 * @param {string} [label]
 */
export function validateValue(schema, value, label = 'value') {
  return orThrow(checkValue(schema, value, label))
}

/**
 * Converts a value as written to its canonical form: durations → ms, sizes → bytes,
 * rates → per second, distributions → normalised objects. Other values pass through. Stored
 * values are canonical already (ADR 0008); percentages convert through checkValue.
 * @param {PropertySchema|undefined} schema
 * @param {unknown} value
 */
export function normalizeValue(schema, value) {
  if (!schema || value === undefined || value === null) return value
  if (schema.type === 'distribution') return normalizeDistribution(value)
  return normalizeScalar(schema.type, value)
}

/**
 * Checks a property schema declared in a manifest. Returns a list of problems (empty if valid).
 * @param {unknown} schema
 * @param {string} path
 * @returns {string[]}
 */
export function checkSchema(schema, path) {
  const errors = []
  if (!isPlainObject(schema)) return [`${path} must be an object`]
  const s = /** @type {PropertySchema} */ (schema)
  if (!PROPERTY_TYPES.includes(s.type)) {
    errors.push(`${path}.type must be one of ${PROPERTY_TYPES.join(', ')}`)
    return errors
  }
  if (s.type === 'enum' && (!Array.isArray(s.values) || s.values.length === 0))
    errors.push(`${path}.values must list the enum options`)
  if (
    s.rollup !== undefined &&
    !ROLLUP_RULES.includes(typeof s.rollup === 'string' ? s.rollup : s.rollup?.rule)
  ) {
    errors.push(`${path}.rollup must be one of ${ROLLUP_RULES.join(', ')}`)
  }
  for (const key of ['min', 'max']) {
    if (s[key] !== undefined) {
      try {
        normalizeScalar(s.type, s[key])
      } catch (err) {
        errors.push(`${path}.${key}: ${err.message}`)
      }
    }
  }
  if (s.type === 'list' && s.items !== undefined)
    errors.push(...checkSchema(s.items, `${path}.items`))
  if (s.type === 'map' && s.values !== undefined)
    errors.push(...checkSchema(s.values, `${path}.values`))
  if (s.default !== undefined && errors.length === 0) {
    try {
      validateValue(s, s.default, `${path}.default`)
    } catch (err) {
      errors.push(err.message)
    }
  }
  return errors
}

/**
 * Default values declared by a property schema map.
 * @param {Record<string, PropertySchema>} properties
 */
export function defaultProps(properties = {}) {
  const out = {}
  for (const [key, schema] of Object.entries(properties)) {
    if (schema.default !== undefined) out[key] = schema.default
  }
  return out
}

/**
 * @typedef {object} PropertySchema
 * @property {string} type
 * @property {string} [unit]
 * @property {unknown} [default]
 * @property {number|string} [min]
 * @property {number|string} [max]
 * @property {unknown[]} [values]   enum options, or the value schema of a map
 * @property {PropertySchema} [items]
 * @property {string} [group]
 * @property {string} [description]
 * @property {string|{rule: string}} [rollup]
 */
