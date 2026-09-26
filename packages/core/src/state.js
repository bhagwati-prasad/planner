// @ts-check
/**
 * Immutable state helpers (eng §7 "State"). State is plain data: entity maps keyed by id,
 * nested in plain objects and arrays. Every update returns a new root that shares each
 * untouched branch with the old one, so an update copies only the path it changes and a change
 * check is a reference comparison. Development builds deep-freeze state as it is committed, so
 * accidental mutation throws instead of corrupting undo, the op log or a view.
 */
import { fail } from './errors.js'
import { deepFreeze } from './plain.js'

/** @typedef {string|number} Key */

/** @param {unknown} value */
const isContainer = value => typeof value === 'object' && value !== null

/**
 * The value at `path`, or undefined when any step is missing.
 * @param {unknown} root
 * @param {Key[]} path
 */
export function getIn(root, path) {
  let value = /** @type {any} */ (root)
  for (const key of path) {
    if (!isContainer(value)) return undefined
    value = value[key]
  }
  return value
}

/**
 * A shallow copy of a container with one key set.
 * @param {any} container
 * @param {Key} key
 * @param {unknown} value
 */
function withKey(container, key, value) {
  if (Array.isArray(container)) {
    const copy = container.slice()
    copy[/** @type {number} */ (key)] = value
    return copy
  }
  return { ...container, [key]: value }
}

/**
 * Returns a new root with `value` at `path`, sharing every branch the path does not pass
 * through. Missing steps become plain objects. Returns `root` itself when the value is already
 * there.
 * @template T
 * @param {T} root
 * @param {Key[]} path
 * @param {unknown} value
 * @returns {T}
 */
export function setIn(root, path, value) {
  return /** @type {T} */ (setAt(root, path, 0, value))
}

/**
 * @param {any} node
 * @param {Key[]} path
 * @param {number} depth
 * @param {unknown} value
 * @returns {any}
 */
function setAt(node, path, depth, value) {
  if (depth === path.length) return value
  const current = node ?? {}
  if (!isContainer(current))
    fail(
      'INVALID',
      `Cannot set ${path.join('.')}: ${path.slice(0, depth).join('.') || 'the root'} is not an object or array`,
      { path }
    )
  const key = path[depth]
  const child = setAt(current[key], path, depth + 1, value)
  if (node !== undefined && node !== null && Object.is(child, current[key]) && key in current)
    return node
  return withKey(current, key, child)
}

/**
 * Returns a new root with `fn(current value)` at `path`.
 * @template T
 * @param {T} root
 * @param {Key[]} path
 * @param {(value: any) => unknown} fn
 * @returns {T}
 */
export function updateIn(root, path, fn) {
  return setIn(root, path, fn(getIn(root, path)))
}

/**
 * Returns a new root without the key or array item at `path`, sharing everything else. Returns
 * `root` itself when there is nothing there to remove.
 * @template T
 * @param {T} root
 * @param {Key[]} path
 * @returns {T}
 */
export function removeIn(root, path) {
  if (!path.length) fail('INVALID', 'removeIn needs a path with at least one key')
  return /** @type {T} */ (removeAt(root, path, 0))
}

/**
 * @param {any} node
 * @param {Key[]} path
 * @param {number} depth
 * @returns {any}
 */
function removeAt(node, path, depth) {
  const key = path[depth]
  if (!isContainer(node) || !(key in node)) return node
  if (depth === path.length - 1) {
    if (Array.isArray(node)) return node.filter((_, i) => i !== Number(key))
    const { [key]: _removed, ...rest } = node
    return rest
  }
  const child = removeAt(node[key], path, depth + 1)
  return child === node[key] ? node : withKey(node, key, child)
}

/**
 * Commits a new state: in development it is deep-frozen, so mutating it throws; production
 * skips the walk. Branches shared with state committed before are already frozen and are not
 * walked again, so freezing costs only what changed.
 * @template T
 * @param {T} state
 * @param {{ development?: boolean }} [options]  development defaults to true
 * @returns {T}
 */
export function commitState(state, { development = true } = {}) {
  return development ? deepFreeze(state) : state
}
