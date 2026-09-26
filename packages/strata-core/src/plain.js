/**
 * Helpers for the "plain data" rule: commands, entities and snapshots are JSON-compatible so
 * they can be logged, undone, synced (R4) and written to a .strata file unchanged.
 */
import { fail } from './errors.js'

/**
 * Deep-clones a value, rejecting anything JSON cannot carry. Object properties that are
 * `undefined` are dropped; `undefined` anywhere else is an error.
 * @template T
 * @param {T} value
 * @param {string} [path]
 * @returns {T}
 */
export function toPlain (value, path = 'value') {
  return /** @type {T} */ (clone(value, path, new Set()))
}

function clone (value, path, seen) {
  if (value === null) return null
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      if (!Number.isFinite(value)) fail('INVALID', `${path} must be a finite number, got ${value}`)
      return value
    case 'undefined':
      fail('INVALID', `${path} is undefined`)
      break
    case 'object': {
      if (seen.has(value)) fail('INVALID', `${path} contains a circular reference`)
      seen.add(value)
      let out
      if (Array.isArray(value)) {
        out = value.map((item, i) => clone(item, `${path}[${i}]`, seen))
      } else {
        const proto = Object.getPrototypeOf(value)
        if (proto !== Object.prototype && proto !== null) {
          fail('INVALID', `${path} is a ${value?.constructor?.name ?? 'non-plain object'}; only plain objects, arrays, strings, finite numbers, booleans and null are allowed`)
        }
        out = {}
        for (const key of Object.keys(value)) {
          if (value[key] === undefined) continue
          out[key] = clone(value[key], `${path}.${key}`, seen)
        }
      }
      seen.delete(value)
      return out
    }
    default:
      fail('INVALID', `${path} is a ${typeof value}, which is not serialisable`)
  }
}

/**
 * Recursively freezes a plain value in place and returns it.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze (value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

/**
 * Structural equality for plain values.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function deepEqual (a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== /** @type {any[]} */ (b).length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

/**
 * Returns a copy of a plain value that is safe to mutate (entities in the store are frozen).
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function thaw (value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

/** @param {unknown} value */
export function isPlainObject (value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
