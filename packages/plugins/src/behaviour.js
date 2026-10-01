/**
 * The behaviour contract (spec §8 "Behaviour API", eng §10): the `ctx` a behaviour's methods
 * receive, and checks of a behaviour module against its manifest and of its source for
 * module-level state. The test context that records what methods do, for component authors'
 * unit tests, lives in strata-sim beside runComponent, since only Node uses either.
 */
import { suggest } from '../../core/src/index.js'
import { tokenize } from './tokenize.js'

/**
 * What a behaviour's methods and hooks receive (spec §8).
 * @typedef {object} BehaviourContext
 * @property {Record<string, any>} props  effective property values in canonical units,
 *   including run-only changes
 * @property {Record<string, any>} state  this instance's typed state; every change is recorded
 * @property {number} now  simulated time in ms
 * @property {() => number} random  a seeded number in [0, 1)
 * @property {(dist: unknown) => number} sample  a draw from a distribution
 * @property {(name: string, args?: unknown) => any} call  calls a private method, as a child span
 * @property {(port: string, method: string|null, args?: unknown, options?: SendOptions) => Promise<any>} send
 *   calls a public method across a port's edge, or the edge's own method when it names none;
 *   resolves when the response arrives in simulated time
 * @property {(port: string, method: string|null, args?: unknown, options?: SendOptions) => void} emit
 *   sends without waiting
 * @property {(port: string) => { edge: string, node: string, weight: number }[]} targets  the
 *   edges leaving a port, in a stable order (ADR 0022)
 * @property {(code: string, details?: unknown) => Failure} fail  an error response, to return
 * @property {(delay: number, name: string, data?: unknown) => void} schedule  a timer that calls
 *   onTimer
 * @property {(dist: unknown) => Promise<void>} spend  waits that many ms, or a draw from a
 *   distribution, in simulated time, holding the call's server (ADR 0021)
 * @property {(name: string, value: number) => void} metric
 * @property {(level: string, ...args: unknown[]) => void} log
 *
 * @typedef {object} SendOptions  a message's protocol details (ADR 0019)
 * @property {string} [path]
 * @property {Record<string, string>} [headers]
 * @property {number} [sizeBytes]
 * @property {string} [edge]  the edge leaving the port to send over, skipping route rules (ADR 0022)
 *
 * @typedef {{ ok: false, code: string, details: unknown }} Failure  what ctx.fail returns
 * @typedef {(input: any, ctx: BehaviourContext) => any} Method  a public method gets the request
 *   message ({ body, ... }); a private one the arguments of ctx.call
 *
 * A behaviour module's default export (spec §8).
 * @typedef {object} Behaviour
 * @property {Record<string, Method>} [public]  the manifest's public methods; a return value is
 *   the response
 * @property {Record<string, Method>} [private]  internal operations, called with ctx.call
 * @property {(ctx: BehaviourContext) => void} [init]  runs after the initial state loads
 * @property {(timer: { name: string, data: unknown }, ctx: BehaviourContext) => void} [onTimer]
 * @property {(fault: unknown, ctx: BehaviourContext) => void} [onFault]
 *
 * @typedef {import('./bundle.js').Problem} Problem
 */

/** The members a behaviour module's default export may have (spec §8). */
export const BEHAVIOUR_HOOKS = Object.freeze(['public', 'private', 'init', 'onTimer', 'onFault'])

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Checks a behaviour module's default export against its manifest: the hooks it has, that its
 * methods are functions, and that its public methods are the ones the manifest declares. A
 * declared method it leaves out is only a warning when the manifest extends a base type, whose
 * behaviour may provide it.
 * @param {unknown} behaviour
 * @param {unknown} manifest
 * @param {{ file?: string }} [options] the entry module, where problems point
 * @returns {Problem[]}
 */
export function validateBehaviour(behaviour, manifest, { file = 'index.js' } = {}) {
  /** @type {Problem[]} */
  const problems = []
  /** @param {import('../../core/src/errors.js').ErrorCode} code @param {string} message */
  const error = (code, message) => problems.push({ level: 'error', code, file, message })
  if (!isObject(behaviour)) {
    error('E_BEHAVIOUR_SHAPE', 'The entry module must export default an object of hooks')
    return problems
  }
  for (const key of Object.keys(behaviour))
    if (!BEHAVIOUR_HOOKS.includes(key)) {
      const close = suggest(key, BEHAVIOUR_HOOKS, 1)
      error(
        'E_BEHAVIOUR_SHAPE',
        `Unknown hook '${key}'. ${close.length ? `Did you mean '${close[0]}'?` : `Hooks are ${BEHAVIOUR_HOOKS.join(', ')}`}`
      )
    }
  for (const hook of ['init', 'onTimer', 'onFault'])
    if (behaviour[hook] !== undefined && typeof behaviour[hook] !== 'function')
      error('E_BEHAVIOUR_SHAPE', `${hook} must be a function`)
  /** @type {Record<string, Record<string, unknown>>} */
  const groups = {}
  for (const scope of ['public', 'private']) {
    const group = behaviour[scope] ?? {}
    groups[scope] = isObject(group) ? group : {}
    if (!isObject(group)) error('E_BEHAVIOUR_SHAPE', `${scope} must be an object of methods`)
    for (const [name, method] of Object.entries(groups[scope]))
      if (typeof method !== 'function')
        error('E_BEHAVIOUR_SHAPE', `${scope}.${name} must be a function`)
  }
  for (const name of Object.keys(groups.private))
    if (name in groups.public) error('E_BEHAVIOUR_SHAPE', `'${name}' is both public and private`)

  const m = isObject(manifest) ? manifest : {}
  const declared = { public: m.methods?.public ?? {}, private: m.methods?.private ?? {} }
  for (const name of Object.keys(groups.public))
    if (!(name in declared.public))
      error(
        'E_BEHAVIOUR_UNDECLARED_METHOD',
        `public.${name} is not a public method in the manifest; declare it under methods.public, or move it to private`
      )
  for (const scope of ['public', 'private'])
    for (const name of Object.keys(declared[scope])) {
      if (name in groups[scope]) continue
      if (m.extends)
        problems.push({
          level: 'warning',
          file,
          message: `The ${scope} method '${name}' has no implementation here, so ${m.extends} must provide it`,
        })
      else
        error(
          'E_BEHAVIOUR_MISSING_METHOD',
          `The ${scope} method '${name}' has no implementation; add it to ${scope} in the behaviour`
        )
    }
  return problems
}

/** Operators that change what their left side names. */
const ASSIGNS = new Set('= += -= *= /= %= **= <<= >>= >>>= &= |= ^= &&= ||= ??= ++ --'.split(' '))
/** Methods that change the array, map or set they are called on. */
const MUTATORS = new Set(
  'push pop shift unshift splice sort reverse fill copyWithin set add delete clear'.split(' ')
)

/**
 * Whether the name at `i` is changed there: assigned through a member or index, changed by a
 * mutating method, deleted from, or passed to Object.assign.
 * @param {import('./tokenize.js').Token[]} tokens
 * @param {number} i
 */
function changesAt(tokens, i) {
  const before = tokens[i - 1]?.value
  if (before === 'delete' || (before === '(' && tokens[i - 2]?.value === 'assign')) return true
  let j = i + 1
  for (;;) {
    const t = tokens[j]
    if (t?.value === '.' || t?.value === '?.') {
      if (tokens[j + 2]?.value === '(') return MUTATORS.has(tokens[j + 1]?.value)
      j += 2
    } else if (t?.value === '[') {
      j = tokens.findIndex((u, k) => k > j && u.value === ']' && u.depth === t.depth) + 1
      if (!j) return false
    } else return j > i + 1 && ASSIGNS.has(t?.value)
  }
}

/**
 * Flags module-level mutable state in a behaviour module's source (eng §10): one worker runs
 * every instance of a component, so a module-level `let` or `var`, or a module-level object,
 * array, map or set that the module changes, leaks between nodes. Constants, frozen objects
 * and locals are fine. A local that shadows a module-level name can be flagged by mistake.
 * @param {string} source the module as written
 * @param {string} file
 * @returns {Problem[]}
 */
export function checkModuleState(source, file) {
  /** @type {Problem[]} */
  const problems = []
  let tokens
  try {
    tokens = tokenize(source)
  } catch {
    return problems // the bundler reports syntax errors
  }
  /** @param {import('./tokenize.js').Token} at @param {string} message */
  const flag = (at, message) =>
    problems.push({
      level: 'error',
      code: 'E_BEHAVIOUR_MODULE_STATE',
      file,
      line: at.line,
      message: `${message}; one worker runs every instance of the component, so it leaks between nodes. Keep it in ctx.state`,
    })
  /** @type {Map<string, number>} module-level containers, by name, to the token naming them */
  const containers = new Map()
  for (const [i, t] of tokens.entries()) {
    if (t.depth !== 0 || !/^(let|var|const)$/.test(t.value) || t.type !== 'name') continue
    const name = tokens[i + 1]
    if (t.value !== 'const')
      flag(name ?? t, `'${name?.type === 'name' ? name.value : t.value}' is module-level state`)
    else if (
      name?.type === 'name' &&
      tokens[i + 2]?.value === '=' &&
      /^([{[]|new)$/.test(tokens[i + 3]?.value ?? '')
    )
      containers.set(name.value, i + 1)
  }
  for (const [name, at] of containers) {
    const change = tokens.find(
      (t, i) =>
        i !== at &&
        t.type === 'name' &&
        t.value === name &&
        tokens[i - 1]?.value !== '.' &&
        changesAt(tokens, i)
    )
    if (change)
      flag(tokens[at], `'${name}' is changed at line ${change.line}, but it is module-level`)
  }
  return problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
}
