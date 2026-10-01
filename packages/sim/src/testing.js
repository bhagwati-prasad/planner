// @ts-check
/**
 * The test context of spec §8's behaviour contract (task 0303), which `strata/testing` offers
 * beside runComponent: it runs a behaviour's methods without the kernel and records what they
 * do. It lives here, with runComponent, because only Node uses it; the worker never imports it.
 */
import {
  StrataError,
  createPrng,
  defaultProps,
  normalizeManifest,
  quantile,
  validateValue,
} from '../../core/src/index.js'

/**
 * A behaviour module's default export (spec §8): its `public` and `private` methods, and its
 * `init`, `onTimer` and `onFault` hooks.
 * @typedef {{ public?: Record<string, Function>, private?: Record<string, Function>, [hook: string]: unknown }} Behaviour
 *
 * A context with spec §8's ctx members, and what they record.
 * @typedef {object} TestContext
 * @property {Record<string, any>} props  property values in canonical units, over the defaults
 * @property {Record<string, any>} state  typed state, whose every change `changes` records
 * @property {number} now  simulated time in ms, which `spend` moves on
 * @property {() => number} random
 * @property {(dist: unknown) => number} sample
 * @property {(name: string, args?: unknown) => any} call  runs a private method, or answers
 *   from `replies`
 * @property {(port: string, method: string|null, args?: unknown, options?: object) => Promise<any>} send
 *   answers from `replies`
 * @property {(port: string, method: string|null, args?: unknown, options?: object) => void} emit
 * @property {(port: string) => { edge: string, node: string, weight: number }[]} targets  the
 *   edges leaving a port, from the `targets` option (ADR 0022)
 * @property {(code: string, details?: unknown) => { ok: false, code: string, details: unknown }} fail
 * @property {(delay: number, name: string, data?: unknown) => void} schedule
 * @property {(dist: unknown) => Promise<void>} spend
 * @property {(name: string, value: number) => void} metric
 * @property {(level: string, ...args: unknown[]) => void} log
 * @property {{ port: string, method: string, args: unknown, options?: object }[]} sent
 * @property {{ port: string, method: string, args: unknown, options?: object }[]} emitted
 * @property {{ name: string, args: unknown }[]} calls
 * @property {{ code: string, details: unknown }[]} failures
 * @property {{ name: string, value: number }[]} metrics
 * @property {{ level: string, args: unknown[] }[]} logs
 * @property {{ delay: number, name: string, data: unknown }[]} scheduled
 * @property {number[]} spent  what each ctx.spend waited, in ms
 * @property {({ op: 'set', path: (string|number)[], value: unknown } | { op: 'delete', path: (string|number)[] })[]} changes
 * @property {() => Record<string, any>} snapshot  a copy of the state
 */

/**
 * A context for unit-testing a behaviour's methods without the kernel. Props start from the
 * manifest's defaults and state from its initial values; `ctx.call` runs the behaviour's
 * private methods; `ctx.send` and a missing private method answer from `replies`. It records
 * what the methods do: messages sent and emitted, calls, failures, metrics, logs, timers and
 * every state change, with its path. Setting a state field the manifest does not declare
 * throws, as development builds do.
 * @param {object} [options]
 * @param {unknown} [options.manifest]
 * @param {Behaviour} [options.behaviour]
 * @param {Record<string, unknown>} [options.props]  values as written, over the defaults
 * @param {Record<string, unknown>} [options.state]  fields over the initial values
 * @param {number} [options.now]  simulated time in ms
 * @param {number|string} [options.seed]
 * @param {Record<string, unknown>} [options.replies]  answers by 'port.method' for ctx.send (by
 *   'port' alone for a send that names no method, which calls the edge's method, ADR 0019), or
 *   by name for ctx.call: a value, or a function of the arguments
 * @param {Record<string, { edge: string, node: string, weight: number }[]>} [options.targets]
 *   what ctx.targets answers, by port (ADR 0022)
 * @returns {TestContext}
 * @example
 * const ctx = createTestContext({ manifest, behaviour, replies: { 'db.insert': { id: 7 } } })
 * await behaviour.public.placeOrder({ body: order }, ctx)
 * assert.deepEqual(ctx.sent, [{ port: 'db', method: 'insert', args: { table: 'orders', row: order } }])
 */
export function createTestContext({
  manifest,
  behaviour,
  props = {},
  state = {},
  now = 0,
  seed = 1,
  replies = {},
  targets: edgesOut = {},
} = {}) {
  const m = manifest ? normalizeManifest(manifest) : null
  const schemas = m?.properties ?? {}
  /** @type {Record<string, { initial?: unknown }>|null} */
  const fields = /** @type {any} */ (m)?.state ?? null
  const prng = createPrng(seed)
  /**
   * A deep copy, read through watched parts of state, as the run copies what leaves a method.
   * @template T @param {T} value @returns {T}
   */
  const clone = value => {
    if (typeof value !== 'object' || value === null) return value
    const target = targets.get(value) ?? value
    if (Array.isArray(target)) return /** @type {any} */ (target.map(clone))
    const proto = Object.getPrototypeOf(target)
    if (proto !== Object.prototype && proto !== null)
      return /** @type {any} */ (structuredClone(target))
    return /** @type {any} */ (
      Object.fromEntries(Object.entries(target).map(([k, v]) => [k, clone(v)]))
    )
  }
  /** @param {string} key @param {unknown} args */
  const answer = (key, args) => {
    const reply = replies[key]
    return typeof reply === 'function' ? reply(args) : reply
  }

  /** @type {WeakMap<object, object>} proxy → the object it watches */
  const targets = new WeakMap()
  /** Replaces watched objects inside a value with the objects themselves. @param {any} value */
  const unwrap = value => {
    if (typeof value !== 'object' || value === null) return value
    const target = targets.get(value)
    if (target) return target
    for (const key of Object.keys(value)) value[key] = unwrap(value[key])
    return value
  }
  /** @param {any} target @param {(string|number)[]} path */
  const watch = (target, path) => {
    /** @param {string|symbol} key */
    const at = key => [
      ...path,
      Array.isArray(target) && /^\d+$/.test(String(key)) ? Number(key) : String(key),
    ]
    const proxy = new Proxy(target, {
      get(obj, key) {
        const value = obj[key]
        return typeof value === 'object' && value !== null && typeof key === 'string'
          ? watch(value, at(key))
          : value
      },
      set(obj, key, value) {
        if (!path.length && fields && !(String(key) in fields))
          throw new StrataError(
            'E_BEHAVIOUR_UNDECLARED_STATE',
            `state.${String(key)} is not declared in the manifest; declare it under state with a type and an initial value`
          )
        obj[key] = unwrap(value)
        if (typeof key === 'string' && !(Array.isArray(obj) && key === 'length'))
          ctx.changes.push({ op: 'set', path: at(key), value: clone(obj[key]) })
        return true
      },
      deleteProperty(obj, key) {
        delete obj[key]
        if (typeof key === 'string') ctx.changes.push({ op: 'delete', path: at(key) })
        return true
      },
    })
    targets.set(proxy, target)
    return proxy
  }
  const root = {
    ...Object.fromEntries(Object.entries(fields ?? {}).map(([k, f]) => [k, clone(f.initial)])),
    ...clone(state),
  }

  /** @type {TestContext} */
  const ctx = {
    props: {
      ...defaultProps(schemas),
      ...Object.fromEntries(
        Object.entries(props).map(([k, v]) => [
          k,
          schemas[k] ? validateValue(schemas[k], v, `props.${k}`) : v,
        ])
      ),
    },
    get state() {
      return watch(root, [])
    },
    now,
    random: () => prng.next(),
    sample: dist => (typeof dist === 'number' ? dist : quantile(dist, prng.next())),
    call(name, args) {
      ctx.calls.push({ name, args: clone(args) })
      const method = behaviour?.private?.[name]
      if (method) return method(args, ctx)
      if (name in replies) return answer(name, args)
      throw new StrataError(
        'E_BEHAVIOUR_MISSING_METHOD',
        `No private method '${name}' in the behaviour, and no reply for it in replies`
      )
    },
    send(port, method, args, options) {
      ctx.sent.push({
        port,
        method,
        args: clone(args),
        ...(options ? { options: clone(options) } : {}),
      })
      return Promise.resolve(answer(method == null ? port : `${port}.${method}`, args))
    },
    targets: port => clone(edgesOut[port] ?? []),
    emit(port, method, args, options) {
      ctx.emitted.push({
        port,
        method,
        args: clone(args),
        ...(options ? { options: clone(options) } : {}),
      })
    },
    fail(code, details) {
      ctx.failures.push({ code, details: clone(details) })
      return { ok: false, code, details }
    },
    spend(dist) {
      const ms = typeof dist === 'number' ? dist : ctx.sample(dist)
      ctx.spent.push(ms)
      ctx.now += ms
      return Promise.resolve()
    },
    schedule(delay, name, data) {
      ctx.scheduled.push({ delay, name, data: clone(data) })
    },
    metric(name, value) {
      ctx.metrics.push({ name, value })
    },
    log(level, ...args) {
      ctx.logs.push({ level, args: clone(args) })
    },
    sent: [],
    emitted: [],
    calls: [],
    failures: [],
    metrics: [],
    logs: [],
    scheduled: [],
    spent: [],
    changes: [],
    snapshot: () => structuredClone(root),
  }
  return ctx
}
