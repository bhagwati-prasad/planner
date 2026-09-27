// @ts-check
/**
 * Canonical units (eng §8): the unit each quantity is stored in, and conversions to and from
 * the way people write it. Values are converted at the edges (manifest parsing, UI input, file
 * import) and back only for display.
 *
 *   timestamp  epoch milliseconds, UTC integer   2026-09-25T09:00:00.000Z
 *   duration   milliseconds                      4 d, 2 h 30 min, 45 s, 184 ms
 *   simTime    integer microseconds              31.204 s
 *   size       bytes (1 KB = 1,000 B)            512 KB, 1.5 MB (1.5 GiB is read too)
 *   rate       per second                        850 req/s, 1.2k req/s (30 req/min is read too)
 *   bandwidth  bits per second                   100 Mbps, 10 Gbps
 *   percent    a fraction                        82%
 *   money      { amountMicros, currency }        1,240.00 USD
 *
 * formatQuantity writes the exact value, so parseQuantity(formatQuantity(x)) is x: decimal
 * scaling moves the decimal point in the number's digits instead of multiplying, which would
 * round. The UI formatter rounds for display (design system §11).
 */
import { fail } from './errors.js'
import { err, ok } from './result.js'

const DURATION_UNITS = {
  ms: 1,
  s: 1000,
  sec: 1000,
  m: 60_000,
  min: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
}
/** The units a duration is written in, largest first. */
const DURATION_PARTS = /** @type {const} */ ([
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['min', 60_000],
  ['s', 1000],
  ['ms', 1],
])
/** Decimal size units as powers of ten, and binary ones as factors. */
const SIZE_EXPONENTS = { b: 0, kb: 3, mb: 6, gb: 9, tb: 12, pb: 15 }
const BINARY_SIZES = { kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4, pib: 1024 ** 5 }
/** Seconds in each unit a rate may be written per. */
const RATE_SECONDS = {
  s: 1,
  sec: 1,
  second: 1,
  m: 60,
  min: 60,
  minute: 60,
  h: 3600,
  hr: 3600,
  hour: 3600,
  d: 86400,
  day: 86400,
}
/** @type {Record<string, number>} */
const SI = { '': 0, k: 3, M: 6, G: 9, T: 12 }

/**
 * `x` times 10^k, written in plain decimal digits exactly: the decimal point of the shortest
 * text that reads back as `x` moves k places, so nothing is rounded.
 * @param {number} x
 * @param {number} k
 */
export function decimal(x, k) {
  const [mantissa, exponent = '0'] = String(x).split('e')
  const sign = mantissa.startsWith('-') ? '-' : ''
  const [whole, fraction = ''] = mantissa.replace('-', '').split('.')
  let digits = whole + fraction
  let point = whole.length + Number(exponent) + k
  if (point <= 0) {
    digits = '0'.repeat(1 - point) + digits
    point = 1
  }
  digits = digits.padEnd(point, '0')
  const int = digits.slice(0, point).replace(/^0+(?=\d)/, '')
  const frac = digits.slice(point).replace(/0+$/, '')
  return `${sign}${int}${frac ? `.${frac}` : ''}`
}

/** The number decimal text times 10^k, rounded once. @param {string} text @param {number} k */
const scaled = (text, k) => Number(`${text}e${k}`)

/**
 * Milliseconds in a duration: a number (already ms) or a string such as '250ms', '1.5s', '4 d'
 * or '2 h 30 min'. Undefined when it is neither.
 * @param {unknown} value
 * @returns {number|undefined}
 */
export function durationMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const src = value.trim()
  const re = /(\d+(?:\.\d+)?)\s*(ms|sec|min|hr|s|m|h|d|w)/gy
  let total = 0
  let consumed = 0
  for (let match = re.exec(src); match; match = re.exec(src)) {
    total +=
      Number(match[1]) * DURATION_UNITS[/** @type {keyof typeof DURATION_UNITS} */ (match[2])]
    consumed = re.lastIndex
    while (src[consumed] === ' ') consumed++
    re.lastIndex = consumed
  }
  return consumed === 0 || consumed !== src.length ? undefined : total
}

/**
 * Bytes in a size: a number (already bytes) or a string such as '512B', '10 MB' or '1.5GiB'.
 * Undefined when it is neither.
 * @param {unknown} value
 * @returns {number|undefined}
 */
export function sizeBytes(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const m = typeof value === 'string' && /^\s*(\d+(?:\.\d+)?)\s*([kmgtp]i?b|b)\s*$/i.exec(value)
  if (!m) return undefined
  const unit = m[2].toLowerCase()
  return unit in BINARY_SIZES
    ? Number(m[1]) * BINARY_SIZES[/** @type {keyof typeof BINARY_SIZES} */ (unit)]
    : scaled(m[1], SIZE_EXPONENTS[/** @type {keyof typeof SIZE_EXPONENTS} */ (unit)])
}

/**
 * Events per second in a rate: a number (already per second) or a string such as '500/s',
 * '1.2k req/s' or '30 req/min'. Undefined when it is neither.
 * @param {unknown} value
 * @returns {number|undefined}
 */
export function perSecond(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const m =
    typeof value === 'string' &&
    /^\s*(\d+(?:\.\d+)?)([kM])?\s*(?:[A-Za-z]+\s*)?\/\s*([A-Za-z]+)\s*$/.exec(value)
  const seconds = m && RATE_SECONDS[/** @type {keyof typeof RATE_SECONDS} */ (m[3].toLowerCase())]
  if (!m || !seconds) return undefined
  return scaled(m[1], SI[m[2] ?? '']) / seconds
}

/** @param {number} ms */
function formatDuration(ms) {
  if (!Number.isInteger(ms) || ms < 1000) return `${decimal(ms, 0)} ms`
  const parts = []
  let rest = ms
  for (const [unit, size] of DURATION_PARTS) {
    const count = (rest - (rest % size)) / size
    if (count) parts.push(`${count} ${unit}`)
    rest %= size
  }
  return parts.join(' ')
}

/**
 * `x` in the largest unit it reaches, e.g. 1200 with k at 3 → ['1.2', 'k'].
 * @param {number} x
 * @param {[string, number][]} units  name and power of ten, largest first
 * @param {string} base  the unit below them all
 * @returns {[string, string]}
 */
function largest(x, units, base) {
  const [unit, k] = units.find(([, e]) => x >= 10 ** e) ?? [base, 0]
  return [decimal(x, -k), unit]
}

const SIZE_UNITS = /** @type {[string, number][]} */ ([
  ['PB', 15],
  ['TB', 12],
  ['GB', 9],
  ['MB', 6],
  ['KB', 3],
])
const RATE_PREFIXES = /** @type {[string, number][]} */ ([
  ['M', 6],
  ['k', 3],
])
const BANDWIDTH_PREFIXES = /** @type {[string, number][]} */ ([
  ['T', 12],
  ['G', 9],
  ['M', 6],
  ['k', 3],
])

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/
const MONEY = /^(?:([A-Z]{3})\s+)?(-?(?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d+))?(?:\s+([A-Z]{3}))?$/

/** @param {number} value @param {string} quantity */
const refuse = (value, quantity) =>
  fail('E_UNIT_VALUE', `${JSON.stringify(value)} is not a canonical ${quantity}`, {
    quantity,
    value,
  })

/**
 * @typedef {object} QuantityDef
 * @property {(text: string) => any} parse   the canonical value, or undefined
 * @property {(value: any, options: { noun?: string }) => string} format
 */

/** @type {Record<string, QuantityDef>} */
const DEFS = {
  timestamp: {
    parse(text) {
      const m = ISO.exec(text)
      if (!m) return undefined
      const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
      const ms = Date.UTC(y, mo - 1, d, h, mi, s, Number((m[7] ?? '').padEnd(3, '0')))
      // Date.UTC rolls 31 April over into May; a date that does not exist is refused.
      return new Date(ms).toISOString().slice(0, 19) === text.slice(0, 19) ? ms : undefined
    },
    format: ms => (Number.isSafeInteger(ms) ? new Date(ms).toISOString() : refuse(ms, 'timestamp')),
  },
  duration: {
    parse: text => (/^\d/.test(text) ? durationMs(text) : undefined),
    format: ms => (Number.isFinite(ms) && ms >= 0 ? formatDuration(ms) : refuse(ms, 'duration')),
  },
  simTime: {
    parse(text) {
      const m = /^(?:t\s*=\s*)?(\d+(?:\.\d+)?)\s*s$/.exec(text)
      const us = m ? scaled(m[1], 6) : NaN
      return Number.isSafeInteger(us) ? us : undefined
    },
    format: us =>
      Number.isSafeInteger(us) && us >= 0 ? `${decimal(us, -6)} s` : refuse(us, 'simTime'),
  },
  size: {
    parse: text => (/^\d/.test(text) ? sizeBytes(text) : undefined),
    format: bytes =>
      Number.isFinite(bytes) && bytes >= 0
        ? largest(bytes, SIZE_UNITS, 'B').join(' ')
        : refuse(bytes, 'size'),
  },
  rate: {
    parse: text => (/^\d/.test(text) ? perSecond(text) : undefined),
    format: (x, { noun }) =>
      Number.isFinite(x) && x >= 0
        ? `${largest(x, RATE_PREFIXES, '').join('')}${noun ? ` ${noun}` : ''}/s`
        : refuse(x, 'rate'),
  },
  bandwidth: {
    parse(text) {
      const m = /^(\d+(?:\.\d+)?)\s*([kMGT]?)bps$/.exec(text)
      return m ? scaled(m[1], SI[m[2]]) : undefined
    },
    format: bps =>
      Number.isFinite(bps) && bps >= 0
        ? `${largest(bps, BANDWIDTH_PREFIXES, '').join(' ')}bps`
        : refuse(bps, 'bandwidth'),
  },
  percent: {
    parse(text) {
      const m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(text)
      return m ? scaled(m[1], -2) : undefined
    },
    format: x => (Number.isFinite(x) ? `${decimal(x, 2)}%` : refuse(x, 'percent')),
  },
  money: {
    parse(text) {
      const m = MONEY.exec(text)
      if (!m || !m[1] === !m[4]) return undefined
      const amountMicros = scaled(`${m[2].replace(/,/g, '')}.${m[3] ?? '0'}`, 6)
      return Number.isSafeInteger(amountMicros)
        ? { amountMicros: amountMicros || 0, currency: m[1] ?? m[4] }
        : undefined
    },
    format(money) {
      const { amountMicros: micros, currency } = money ?? {}
      if (!Number.isSafeInteger(micros) || !/^[A-Z]{3}$/.test(currency)) refuse(money, 'money')
      const abs = Math.abs(micros)
      const whole = String((abs - (abs % 1e6)) / 1e6).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      const fraction = String(abs % 1e6)
        .padStart(6, '0')
        .replace(/(\d\d\d*?)0*$/, '$1')
      return `${micros < 0 ? '-' : ''}${whole}.${fraction} ${currency}`
    },
  },
}

/** The quantities that convert, one per row of the eng §8 units table. */
export const QUANTITIES = Object.freeze(Object.keys(DEFS))

/** @param {string} quantity */
function defOf(quantity) {
  return (
    DEFS[quantity] ??
    fail('E_UNIT_UNKNOWN', `No quantity '${quantity}'; use one of ${QUANTITIES.join(', ')}`, {
      quantity,
    })
  )
}

/**
 * Reads a written quantity into its canonical value: ok(value), or err('E_UNIT_PARSE').
 * @param {string} quantity  one of QUANTITIES
 * @param {string} text      e.g. '4 d', '512 KB', '82%', '1,240.00 USD'
 * @returns {import('./result.js').Ok<any> | import('./result.js').Err}
 */
export function parseQuantity(quantity, text) {
  const value = typeof text === 'string' ? defOf(quantity).parse(text.trim()) : undefined
  return value === undefined
    ? err('E_UNIT_PARSE', {
        quantity,
        text,
        message: `${JSON.stringify(text)} is not a ${quantity} this build can read`,
      })
    : ok(value)
}

/**
 * Writes a canonical value exactly, in the largest unit it reaches. Throws E_UNIT_VALUE for a
 * value that is not canonical (a negative size, money in fractions of a micro-unit).
 * @param {string} quantity  one of QUANTITIES
 * @param {any} value
 * @param {{ noun?: string }} [options]  `noun`: what a rate counts, as in '850 req/s'
 * @returns {string}
 */
export function formatQuantity(quantity, value, options = {}) {
  return defOf(quantity).format(value, options)
}
