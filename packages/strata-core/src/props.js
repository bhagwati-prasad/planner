/**
 * Property schemas and values (spec §7 "Manifest"): the types a component manifest may declare,
 * parsing of unit-bearing values (durations, sizes, rates), distributions, validation, defaults
 * and effective values.
 *
 * Stored property values keep the author's notation ("4d", "10MB"); `normalizeValue` converts
 * them to canonical numbers (ms, bytes, per second) for consumers such as roll-ups and the
 * simulation.
 */
import { fail, StrataError } from './errors.js'
import { isPlainObject } from './plain.js'

export const PROPERTY_TYPES = Object.freeze([
  'number', 'integer', 'boolean', 'string', 'enum', 'duration', 'bytes', 'rate', 'percent',
  'distribution', 'list', 'map', 'ref'
])

/** Aggregation rules from spec §6 "Data roll-up", plus plain min and max (§7). */
export const ROLLUP_RULES = Object.freeze([
  'sum', 'min', 'max', 'min-path', 'critical-path', 'worst', 'product', 'union', 'count'
])

export const DISTRIBUTION_KINDS = Object.freeze([
  'constant', 'uniform', 'normal', 'exponential', 'lognormal', 'empirical'
])

const DURATION_UNITS = { ms: 1, s: 1000, sec: 1000, m: 60_000, min: 60_000, h: 3_600_000, hr: 3_600_000, d: 86_400_000, w: 604_800_000 }
const BYTE_UNITS = {
  b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15,
  kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4, pib: 1024 ** 5
}
const RATE_UNITS = { s: 1, sec: 1, second: 1, m: 1 / 60, min: 1 / 60, minute: 1 / 60, h: 1 / 3600, hr: 1 / 3600, hour: 1 / 3600, d: 1 / 86400, day: 1 / 86400 }

/**
 * Parses a duration to milliseconds: a number (already ms) or strings like "250ms", "1.5s",
 * "4d" and "1h30m".
 * @param {number|string} value
 * @returns {number}
 */
export function parseDuration (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') fail('INVALID', `Invalid duration ${JSON.stringify(value)}`)
  const src = value.trim()
  const re = /(\d+(?:\.\d+)?)\s*(ms|sec|min|hr|s|m|h|d|w)/gy
  let total = 0
  let consumed = 0
  let match
  while ((match = re.exec(src))) {
    total += Number(match[1]) * DURATION_UNITS[match[2]]
    consumed = re.lastIndex
    while (src[consumed] === ' ') consumed++
    re.lastIndex = consumed
  }
  if (consumed === 0 || consumed !== src.length) fail('INVALID', `Invalid duration '${value}' (use e.g. 250ms, 30s, 5m, 4d, 1h30m)`)
  return total
}

/**
 * Parses a size to bytes: a number (already bytes) or "512B", "10MB", "1.5GiB".
 * @param {number|string} value
 */
export function parseBytes (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const m = typeof value === 'string' && /^\s*(\d+(?:\.\d+)?)\s*([kmgtp]i?b|b)\s*$/i.exec(value)
  if (!m) fail('INVALID', `Invalid size ${JSON.stringify(value)} (use e.g. 512B, 10MB, 1.5GiB)`)
  return Number(m[1]) * BYTE_UNITS[m[2].toLowerCase()]
}

/**
 * Parses a rate to events per second: a number (already per second) or "500/s", "30 req/min".
 * @param {number|string} value
 */
export function parseRate (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const m = typeof value === 'string' && /^\s*(\d+(?:\.\d+)?)\s*(?:[a-z]+\s*)?\/\s*(second|minute|hour|day|sec|min|hr|s|m|h|d)\s*$/i.exec(value)
  if (!m) fail('INVALID', `Invalid rate ${JSON.stringify(value)} (use e.g. 500/s, 30 req/min)`)
  return Number(m[1]) * RATE_UNITS[m[2].toLowerCase()]
}

/**
 * Validates a distribution and returns its normalised object form.
 * @param {unknown} value
 * @param {string} [label]
 */
export function normalizeDistribution (value, label = 'distribution') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID', `${label} must be finite`)
    return { kind: 'constant', value }
  }
  if (!isPlainObject(value)) fail('INVALID', `${label} must be a number or a distribution object`)
  const d = /** @type {Record<string, any>} */ (value)
  const num = (key, { min = -Infinity, positive = false } = {}) => {
    const v = d[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) fail('INVALID', `${label}.${key} must be a finite number`)
    if (v < min || (positive && v <= 0)) fail('INVALID', `${label}.${key} must be ${positive ? '> 0' : `>= ${min}`}`)
    return v
  }
  switch (d.kind) {
    case 'constant':
      return { kind: 'constant', value: num('value') }
    case 'uniform': {
      const min = num('min'); const max = num('max')
      if (min > max) fail('INVALID', `${label}: min must not exceed max`)
      return { kind: 'uniform', min, max }
    }
    case 'normal':
      return { kind: 'normal', mean: num('mean'), sd: num('sd', { min: 0 }) }
    case 'exponential':
      if (d.rate !== undefined && d.mean === undefined) return { kind: 'exponential', mean: 1 / num('rate', { positive: true }) }
      return { kind: 'exponential', mean: num('mean', { positive: true }) }
    case 'lognormal': {
      const median = num('median', { positive: true }); const p99 = num('p99', { positive: true })
      if (p99 < median) fail('INVALID', `${label}: p99 must be >= median`)
      return { kind: 'lognormal', median, p99 }
    }
    case 'empirical': {
      if (Array.isArray(d.values)) {
        if (!d.values.length || d.values.some(v => typeof v !== 'number' || !Number.isFinite(v))) fail('INVALID', `${label}.values must be a non-empty list of numbers`)
        return { kind: 'empirical', values: [...d.values] }
      }
      if (Array.isArray(d.buckets)) {
        let prev = -Infinity
        let total = 0
        for (const [i, b] of d.buckets.entries()) {
          if (!isPlainObject(b) || typeof b.le !== 'number' || typeof b.count !== 'number' || b.count < 0 || !(b.le > prev)) {
            fail('INVALID', `${label}.buckets[${i}] must be { le, count } with increasing le and count >= 0`)
          }
          prev = b.le
          total += b.count
        }
        if (total <= 0) fail('INVALID', `${label}.buckets must contain at least one observation`)
        return { kind: 'empirical', buckets: d.buckets.map(b => ({ le: b.le, count: b.count })) }
      }
      return fail('INVALID', `${label}: an empirical distribution needs 'values' or 'buckets'`)
    }
    default:
      return fail('INVALID', `${label}.kind must be one of ${DISTRIBUTION_KINDS.join(', ')}`)
  }
}

/**
 * Inverse of the standard normal CDF (Acklam's approximation, |error| < 1.2e-9).
 * @param {number} p in (0, 1)
 */
export function probit (p) {
  if (!(p > 0 && p < 1)) fail('INVALID', `probit is defined on (0, 1), got ${p}`)
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - low) return -probit(1 - p)
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

const Z99 = probit(0.99)

/**
 * The q-quantile of a distribution.
 * @param {unknown} dist
 * @param {number} q in [0, 1]
 */
export function quantile (dist, q) {
  const d = normalizeDistribution(dist)
  if (!(q >= 0 && q <= 1)) fail('INVALID', `Quantile must be in [0, 1], got ${q}`)
  switch (d.kind) {
    case 'constant': return d.value
    case 'uniform': return d.min + q * (d.max - d.min)
    case 'normal':
      if (q === 0 || q === 1) return q === 0 ? -Infinity : Infinity
      return d.mean + d.sd * probit(q)
    case 'exponential': return q === 1 ? Infinity : -d.mean * Math.log(1 - q)
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
export function mean (dist) {
  const d = normalizeDistribution(dist)
  switch (d.kind) {
    case 'constant': return d.value
    case 'uniform': return (d.min + d.max) / 2
    case 'normal': return d.mean
    case 'exponential': return d.mean
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
        sum += b.count * (prevLe + b.le) / 2
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
export function statistic (dist, name) {
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

/** Numeric bound in the schema's own notation (e.g. min: "1s" for a duration). */
function bound (schema, key) {
  const raw = schema[key]
  if (raw === undefined) return undefined
  return normalizeScalar(schema.type, raw)
}

function normalizeScalar (type, value) {
  switch (type) {
    case 'duration': return parseDuration(value)
    case 'bytes': return parseBytes(value)
    case 'rate': return parseRate(value)
    default: return value
  }
}

/**
 * Validates one value against a property schema. Throws a StrataError(INVALID).
 * @param {PropertySchema} schema
 * @param {unknown} value
 * @param {string} [label]
 */
export function validateValue (schema, value, label = 'value') {
  const type = schema.type
  const checkRange = n => {
    const min = bound(schema, 'min')
    const max = bound(schema, 'max')
    if (min !== undefined && n < min) fail('INVALID', `${label} must be >= ${schema.min}, got ${JSON.stringify(value)}`)
    if (max !== undefined && n > max) fail('INVALID', `${label} must be <= ${schema.max}, got ${JSON.stringify(value)}`)
  }
  switch (type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID', `${label} must be a number`)
      checkRange(value)
      return
    case 'integer':
      if (!Number.isInteger(value)) fail('INVALID', `${label} must be an integer`)
      checkRange(value)
      return
    case 'boolean':
      if (typeof value !== 'boolean') fail('INVALID', `${label} must be true or false`)
      return
    case 'string':
      if (typeof value !== 'string') fail('INVALID', `${label} must be a string`)
      return
    case 'enum':
      if (!schema.values?.includes(value)) fail('INVALID', `${label} must be one of ${schema.values?.map(v => JSON.stringify(v)).join(', ')}`)
      return
    case 'duration':
    case 'bytes':
    case 'rate':
      try {
        checkRange(normalizeScalar(type, value))
      } catch (err) {
        if (err instanceof StrataError) fail('INVALID', `${label}: ${err.message}`)
        throw err
      }
      return
    case 'percent':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID', `${label} must be a percentage number`)
      if (value < Number(schema.min ?? 0) || value > Number(schema.max ?? 100)) fail('INVALID', `${label} must be between ${schema.min ?? 0} and ${schema.max ?? 100}`)
      return
    case 'distribution':
      normalizeDistribution(value, label)
      return
    case 'list':
      if (!Array.isArray(value)) fail('INVALID', `${label} must be a list`)
      if (schema.items) value.forEach((item, i) => validateValue(schema.items, item, `${label}[${i}]`))
      return
    case 'map':
      if (!isPlainObject(value)) fail('INVALID', `${label} must be an object`)
      if (schema.values && typeof schema.values === 'object' && !Array.isArray(schema.values)) {
        for (const [k, v] of Object.entries(/** @type {object} */ (value))) validateValue(schema.values, v, `${label}.${k}`)
      }
      return
    case 'ref':
      if (typeof value !== 'string' || !value) fail('INVALID', `${label} must be a node id`)
      return
    default:
      fail('INVALID', `${label} has unknown property type '${type}'`)
  }
}

/**
 * Converts a stored value to its canonical form: durations → ms, sizes → bytes,
 * rates → per second, distributions → normalised objects. Other values pass through.
 * @param {PropertySchema|undefined} schema
 * @param {unknown} value
 */
export function normalizeValue (schema, value) {
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
export function checkSchema (schema, path) {
  const errors = []
  if (!isPlainObject(schema)) return [`${path} must be an object`]
  const s = /** @type {PropertySchema} */ (schema)
  if (!PROPERTY_TYPES.includes(s.type)) {
    errors.push(`${path}.type must be one of ${PROPERTY_TYPES.join(', ')}`)
    return errors
  }
  if (s.type === 'enum' && (!Array.isArray(s.values) || s.values.length === 0)) errors.push(`${path}.values must list the enum options`)
  if (s.rollup !== undefined && !ROLLUP_RULES.includes(typeof s.rollup === 'string' ? s.rollup : s.rollup?.rule)) {
    errors.push(`${path}.rollup must be one of ${ROLLUP_RULES.join(', ')}`)
  }
  for (const key of ['min', 'max']) {
    if (s[key] !== undefined) {
      try { normalizeScalar(s.type, s[key]) } catch (err) { errors.push(`${path}.${key}: ${err.message}`) }
    }
  }
  if (s.type === 'list' && s.items !== undefined) errors.push(...checkSchema(s.items, `${path}.items`))
  if (s.type === 'map' && s.values !== undefined) errors.push(...checkSchema(s.values, `${path}.values`))
  if (s.default !== undefined && errors.length === 0) {
    try { validateValue(s, s.default, `${path}.default`) } catch (err) { errors.push(err.message) }
  }
  return errors
}

/**
 * Default values declared by a property schema map.
 * @param {Record<string, PropertySchema>} properties
 */
export function defaultProps (properties = {}) {
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
