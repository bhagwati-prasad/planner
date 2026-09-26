/**
 * ULIDs (https://github.com/ulid/spec): 48-bit millisecond timestamp + 80 bits of randomness,
 * Crockford base32. Sortable and collision-safe offline, so edits made on disconnected machines
 * can be merged later (spec §5). The factory is monotonic: ids created in the same millisecond,
 * or after the clock moves backwards, still sort in creation order.
 */
import { fail } from './errors.js'
import { secureRandomBytes } from './random.js'

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_LEN = 10
const RANDOM_LEN = 16
const TIME_MAX = 2 ** 48 - 1
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/

/**
 * A ULID generator over the injected clock (eng §6) and random source.
 * @param {{ now: import('./types.js').Clock, random?: import('./types.js').RandomBytes }} adapters
 *   `random` defaults to the platform's cryptographic source
 * @returns {import('./types.js').IdGenerator}
 */
export function createUlidFactory({ now, random = secureRandomBytes }) {
  if (typeof now !== 'function')
    fail('E_ADAPTER_MISSING', 'createUlidFactory needs a clock: { now: () => epoch milliseconds }')
  let lastTime = -1
  /** @type {number[]} */
  let lastRandom = []
  return function ulid() {
    let time = Math.floor(now())
    if (time <= lastTime) {
      time = lastTime
      incrementDigits(lastRandom)
    } else {
      lastTime = time
      lastRandom = Array.from(random(RANDOM_LEN), b => b & 31)
    }
    return encodeTime(time) + lastRandom.map(d => ENCODING[d]).join('')
  }
}

/** @param {number[]} digits */
function incrementDigits(digits) {
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] < 31) {
      digits[i]++
      return
    }
    digits[i] = 0
  }
  fail('CONFLICT', 'ULID random component overflowed within one millisecond')
}

/** @param {number} time */
function encodeTime(time) {
  if (!Number.isInteger(time) || time < 0 || time > TIME_MAX)
    fail('INVALID', `Cannot encode time ${time} in a ULID`)
  let out = ''
  for (let i = 0; i < TIME_LEN; i++) {
    out = ENCODING[time % 32] + out
    time = Math.floor(time / 32)
  }
  return out
}

/** @param {unknown} value */
export function isUlid(value) {
  return typeof value === 'string' && ULID_RE.test(value)
}

/**
 * Millisecond timestamp encoded in a ULID.
 * @param {string} id
 */
export function ulidTime(id) {
  if (!isUlid(id)) fail('INVALID', `Not a ULID: ${id}`)
  let time = 0
  for (let i = 0; i < TIME_LEN; i++) time = time * 32 + ENCODING.indexOf(id[i])
  return time
}
