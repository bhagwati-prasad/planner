// @ts-check
/**
 * A run of components (spec §11 "Method dispatch", §6 "Component anatomy", §8 "Behaviour API").
 * Every hop is a public-method call: a message arrives on a port, names a method, and runs only
 * if the port exposes that public method. Private methods run inside the caller's processing,
 * add their declared latency and appear as child spans; no edge reaches them.
 *
 * Methods get the real `ctx`. The promises it returns (`ctx.send`) are settled only by kernel
 * events. Awaiting one resumes the method in microtasks, so after an event that settles one, or
 * that starts an async method, the run lets microtasks settle before it takes the next event:
 * the method resumes at the event's simulated time, and other messages keep being processed
 * while it waits (eng §13 "Method dispatch, scope and stubs").
 */
import {
  StrataError,
  defaultProps,
  fail,
  isDevelopment,
  normalizeManifest,
} from '../../core/src/index.js'
import { Kernel } from './kernel.js'
import { createStreams } from './random.js'
import { sample } from './sample.js'
import { copy, initialState, stateView } from './state.js'

/**
 * @typedef {object} RunNode
 * @property {string} id
 * @property {object} manifest  as authored; the run normalises it
 * @property {any} [behaviour]  the behaviour module's default export
 * @property {Record<string, unknown>} [props]  property values in canonical units, over the
 *   manifest's defaults
 * @property {Record<string, unknown>} [state]  initial state over the manifest's initial values
 * @property {Record<string, { csv: string }>} [fixtures]  initial rows of table fields, as CSV
 *
 * @typedef {object} RunEdge
 * @property {string} id
 * @property {{ node: string, port: string }} from
 * @property {{ node: string, port: string }} to
 * @property {number} latencyUs  one-way latency in integer microseconds
 *
 * @typedef {object} Span  a method call in the trace (OpenTelemetry's shape, spec §11)
 * @property {string} spanId
 * @property {string|null} parentSpanId
 * @property {string} traceId
 * @property {string} node
 * @property {string} method
 * @property {'public'|'private'|'timer'} kind
 * @property {number} startUs
 * @property {number|null} endUs
 * @property {'running'|'ok'|'error'} status
 * @property {string} [code]  the error code of a failed call
 *
 * @typedef {{ code: string, message: string, details?: unknown }} ErrorBody
 *
 * @typedef {object} Reply  what a request injected into the run got back
 * @property {'pending'|'ok'|'error'} status
 * @property {number|null} atUs  when the response left
 * @property {unknown} [body]
 * @property {ErrorBody} [error]
 */

/** Microtask turns without progress after which the run takes its next event. */
const QUIET_TURNS = 8
/** Failures that `ctx.fail` made, so a returned `{ ok: false }` is not mistaken for one. */
const FAILURES = new WeakSet()

/** @param {unknown} v @returns {v is PromiseLike<unknown>} */
const isThenable = v =>
  (typeof v === 'object' || typeof v === 'function') &&
  v !== null &&
  typeof (/** @type {any} */ (v).then) === 'function'

/**
 * The error body of a failed call.
 * @param {string} node
 * @param {unknown} err  a ctx.fail result, a StrataError or anything thrown
 * @returns {ErrorBody}
 */
function errorBody(node, err) {
  const e = /** @type {any} */ (err)
  if (FAILURES.has(e))
    return { code: e.code, message: `${node} failed with ${e.code}`, details: e.details }
  if (e instanceof StrataError || e instanceof CallError)
    return { code: e.code, message: e.message, details: e.details }
  return { code: 'E_METHOD_FAILED', message: `${node} threw: ${e?.message ?? String(e)}` }
}

/**
 * The error a caller's `ctx.send` rejects with when the call failed. Its code may be Strata's
 * (E_METHOD_NOT_EXPOSED) or the component's own (a `ctx.fail` code from its manifest's errors),
 * so it is not a StrataError, whose codes are Strata's alone.
 */
export class CallError extends Error {
  /** @param {ErrorBody} body */
  constructor({ code, message, details }) {
    super(message)
    this.name = 'CallError'
    this.code = code
    this.details = details
  }
}

/**
 * A promise that only kernel events settle (spec §8: methods may await only promises that ctx
 * returns). It counts the reactions waiting on it for the call that made it.
 */
class Pending {
  #state = 0 // 0 pending, 1 fulfilled, 2 rejected
  /** @type {unknown} */
  #value
  /** @type {((ok: boolean, value: unknown) => void)[]} */
  #reactions = []

  /** @param {Call} owner @param {Run} run */
  constructor(owner, run) {
    this.owner = owner
    this.run = run
  }

  /**
   * @param {((value: any) => unknown) | null} [onFulfilled]
   * @param {((reason: any) => unknown) | null} [onRejected]
   */
  then(onFulfilled, onRejected) {
    this.run.activity++
    return new Promise((resolve, reject) => {
      /** @param {boolean} ok @param {unknown} value */
      const react = (ok, value) => {
        const handler = ok ? onFulfilled : onRejected
        if (typeof handler !== 'function') return ok ? resolve(value) : reject(value)
        try {
          resolve(handler(value))
        } catch (err) {
          reject(err)
        }
      }
      if (this.#state) react(this.#state === 1, this.#value)
      else {
        this.owner.waiting++
        this.#reactions.push(react)
      }
    })
  }

  /** @param {boolean} ok @param {unknown} value */
  settle(ok, value) {
    if (this.#state) return
    this.#state = ok ? 1 : 2
    this.#value = value
    const reactions = this.#reactions
    this.#reactions = []
    this.owner.waiting -= reactions.length
    if (reactions.length) this.run.wake()
    for (const react of reactions) react(ok, value)
  }
}

/**
 * One call of a public method or timer and the private calls it makes, which share its time.
 * @typedef {object} Call
 * @property {number} busyUntil  when the call's processing so far ends, in µs
 * @property {number} ownUs      the method's own declared latency, added as it completes
 * @property {number} waiting    reactions waiting on its ctx promises
 * @property {boolean} done
 * @property {Span} span
 * @property {((ok: boolean, value: unknown, atUs: number) => void) | null} respond
 */

export class Run {
  kernel = new Kernel()
  /** @type {Span[]} */
  spans = []
  /** @type {{ atUs: number, node: string, name: string, value: number }[]} */
  metrics = []
  /** @type {{ atUs: number, node: string, level: string, args: unknown[] }[]} */
  logs = []
  /**
   * Every state change, for the debugger (spec §6).
   * @type {{ event: number, spanId: string, node: string, op: 'set'|'delete', path: (string|number)[], value?: unknown }[]}
   */
  changes = []
  /** Counts what behaviour code does, so the run can tell when microtasks have settled. */
  activity = 0
  #woken = false
  #ids = 0
  /** @type {Map<string, any>} */
  #nodes = new Map()
  /** @type {Map<string, RunEdge>} `node.port` → the edge leaving it */
  #edges = new Map()
  /** @type {Set<Call>} async calls not yet finished */
  #live = new Set()

  /**
   * @param {{ seed?: number, nodes: RunNode[], edges?: RunEdge[] }} input
   */
  constructor({ seed = 1, nodes, edges = [] }) {
    const streams = createStreams(seed)
    const strict = isDevelopment()
    for (const n of nodes) {
      const manifest = normalizeManifest(n.manifest)
      const fields = /** @type {any} */ (manifest).state ?? {}
      this.#nodes.set(n.id, {
        id: n.id,
        manifest,
        behaviour: n.behaviour ?? {},
        props: { ...defaultProps(manifest.properties ?? {}), ...n.props },
        fields,
        strict,
        state: initialState(fields, n),
        random: streams.stream(n.id),
        latency: streams.stream(`${n.id}:latency`),
      })
    }
    for (const e of edges) this.#edges.set(`${e.from.node}.${e.from.port}`, e)
  }

  /** Simulated time in µs. */
  get nowUs() {
    return this.kernel.nowUs
  }

  /** Asks the run to let microtasks settle before its next event. */
  wake() {
    this.#woken = true
  }

  /**
   * Sends a request to a node's port from outside the run: a unit-style injection (spec §11
   * "Sources and load"). The reply fills in when the response leaves.
   * @param {{ node: string, port: string, method?: string, body?: unknown, atUs?: number }} request
   * @returns {Reply}
   */
  inject({ node, port, method, body, atUs = this.nowUs }) {
    /** @type {Reply} */
    const reply = { status: 'pending', atUs: null }
    this.kernel.schedule(atUs - this.nowUs, {
      type: 'deliver',
      message: {
        kind: 'request',
        traceId: this.#id(32),
        parentSpanId: null,
        method,
        body: copy(body),
        to: { node, port },
        reply,
      },
    })
    return reply
  }

  /**
   * Handles events until none are left.
   * @param {{ maxEvents?: number }} [limits]
   */
  async runToEnd({ maxEvents = 10_000_000 } = {}) {
    const handlers = {
      deliver: (/** @type {any} */ e) => this.#deliver(e.message),
      timer: (/** @type {any} */ e) => this.#timer(e),
    }
    while (this.kernel.step(handlers)) {
      if (this.#woken) await this.#settle()
      if (this.kernel.processed >= maxEvents)
        fail('INVALID', `The run stopped after ${maxEvents} events`)
    }
  }

  /**
   * Lets resumed methods run until microtasks bring no more progress, then fails any call left
   * waiting on something that is not a ctx promise.
   */
  async #settle() {
    this.#woken = false
    for (let quiet = 0; quiet < QUIET_TURNS;) {
      const before = this.activity
      await null
      quiet = this.activity === before ? quiet + 1 : 0
    }
    for (const call of this.#live)
      if (call.waiting === 0)
        this.#finish(
          call,
          false,
          new StrataError(
            'E_BEHAVIOUR_AWAIT',
            `${call.span.method} of ${call.span.node} awaited something other than a ctx promise; await only what ctx.send returns`
          )
        )
  }

  /** @param {any} message */
  #deliver(message) {
    if (message.kind === 'response') return message.pending.settle(message.ok, message.value)
    const node =
      this.#nodes.get(message.to.node) ??
      fail('E_SIM_COMPONENT_NOT_FOUND', `Component '${message.to.node}' is not in the run`)
    const span = this.#span(
      node.id,
      message.method ?? '',
      'public',
      message.traceId,
      message.parentSpanId
    )
    /** @type {Call['respond']} */
    const respond =
      message.kind === 'event' ? null : (ok, value, atUs) => this.#respond(message, ok, value, atUs)
    const port = node.manifest.ports.find((/** @type {any} */ p) => p.name === message.to.port)
    const method = message.method ?? port?.default
    span.method = method ?? ''
    const publicMethods = node.manifest.methods?.public ?? {}
    if (!port)
      return this.#refuse(
        span,
        respond,
        new StrataError('E_PORT_NOT_FOUND', `${node.id} has no port '${message.to.port}'`)
      )
    if (!method || !port.exposes?.includes(method) || !(method in publicMethods)) {
      const isPrivate = method && method in (node.manifest.methods?.private ?? {})
      return this.#refuse(
        span,
        respond,
        new StrataError(
          'E_METHOD_NOT_EXPOSED',
          `'${method}' is not exposed by port '${port.name}' of ${node.id}${isPrivate ? '; it is a private method, which no edge reaches' : ''}`
        )
      )
    }
    const fn = node.behaviour.public?.[method]
    if (typeof fn !== 'function')
      return this.#refuse(
        span,
        respond,
        new StrataError('E_METHOD_UNKNOWN', `${node.id} has no behaviour for '${method}'`)
      )
    this.#start(node, span, respond, this.#latency(node, publicMethods[method]), call =>
      fn.call(node.behaviour.public, message, this.#context(node, call, span))
    )
  }

  /** @param {{ node: string, name: string, data: unknown, traceId: string, parentSpanId: string }} e */
  #timer({ node: id, name, data, traceId, parentSpanId }) {
    const node = /** @type {any} */ (this.#nodes.get(id))
    const span = this.#span(id, name, 'timer', traceId, parentSpanId)
    const fn = node.behaviour.onTimer
    if (typeof fn !== 'function')
      return this.#refuse(
        span,
        null,
        new StrataError('E_METHOD_UNKNOWN', `${id} set timer '${name}' but has no onTimer`)
      )
    this.#start(node, span, null, 0, call =>
      fn.call(node.behaviour, { name, data }, this.#context(node, call, span))
    )
  }

  /**
   * Starts a call; an async one finishes when its promise settles.
   * @param {any} node @param {Span} span @param {Call['respond']} respond @param {number} ownUs
   * @param {(call: Call) => unknown} body
   */
  #start(node, span, respond, ownUs, body) {
    /** @type {Call} */
    const call = { busyUntil: this.nowUs, ownUs, waiting: 0, done: false, span, respond }
    let out
    try {
      out = body(call)
    } catch (err) {
      return this.#finish(call, false, err)
    }
    if (!isThenable(out)) return this.#finish(call, true, out)
    this.#live.add(call)
    this.wake()
    out.then(
      value => this.#finish(call, true, value),
      err => this.#finish(call, false, err)
    )
  }

  /** @param {Call} call @param {boolean} ok @param {unknown} value */
  #finish(call, ok, value) {
    if (call.done) return
    call.done = true
    this.#live.delete(call)
    this.activity++
    const atUs = Math.max(call.busyUntil, this.nowUs) + call.ownUs
    const failed = !ok || FAILURES.has(/** @type {any} */ (value))
    const body = failed ? errorBody(call.span.node, value) : copy(value)
    this.#end(
      call.span,
      failed ? 'error' : 'ok',
      atUs,
      failed ? /** @type {ErrorBody} */ (body).code : undefined
    )
    call.respond?.(!failed, body, atUs)
  }

  /** @param {Span} span @param {Call['respond']} respond @param {StrataError} err */
  #refuse(span, respond, err) {
    const body = errorBody(span.node, err)
    this.#end(span, 'error', this.nowUs, body.code)
    respond?.(false, body, this.nowUs)
  }

  /**
   * @param {Span} span @param {'ok'|'error'} status @param {number} [atUs] @param {string} [code]
   */
  #end(span, status, atUs = this.nowUs, code) {
    span.endUs = atUs
    span.status = status
    if (code) span.code = code
  }

  /**
   * Sends the response of a request: to the reply of an injected one, or back over its edge.
   * @param {any} message @param {boolean} ok @param {unknown} value @param {number} atUs
   */
  #respond(message, ok, value, atUs) {
    if (message.reply) {
      Object.assign(
        message.reply,
        ok ? { status: 'ok', atUs, body: value } : { status: 'error', atUs, error: value }
      )
      return
    }
    this.kernel.schedule(atUs - this.nowUs + message.edge.latencyUs, {
      type: 'deliver',
      message: {
        kind: 'response',
        pending: message.pending,
        ok,
        value: ok ? value : new CallError(/** @type {ErrorBody} */ (value)),
      },
    })
  }

  /**
   * The ctx a method or timer gets (spec §8 "Behaviour API").
   * @param {any} node @param {Call} call @param {Span} span
   */
  #context(node, call, span) {
    const run = this
    const touch = () => run.activity++
    const random = () => node.random.nextU32() / 2 ** 32
    /** @type {Record<string, unknown>|undefined} */
    let state
    const ctx = {
      props: node.props,
      get state() {
        return (state ??= stateView(node.state, {
          node: node.id,
          fields: node.fields,
          strict: node.strict,
          record: (op, path, value) =>
            run.changes.push({
              event: run.kernel.processed,
              spanId: span.spanId,
              node: node.id,
              op,
              path,
              ...(op === 'set' ? { value: copy(value) } : {}),
            }),
        }))
      },
      /** Simulated time in ms. */
      get now() {
        return run.nowUs / 1000
      },
      random,
      sample: (/** @type {unknown} */ dist) =>
        typeof dist === 'number' ? dist : sample(dist, random()),
      call: (/** @type {string} */ name, /** @type {unknown} */ args) => (
        touch(),
        run.#private(node, call, span, name, args)
      ),
      send: (
        /** @type {string} */ port,
        /** @type {string} */ method,
        /** @type {unknown} */ args
      ) => (touch(), run.#send(node, call, span, port, method, args, true)),
      emit: (
        /** @type {string} */ port,
        /** @type {string} */ method,
        /** @type {unknown} */ args
      ) => {
        touch()
        run.#send(node, call, span, port, method, args, false)
      },
      fail: (/** @type {string} */ code, /** @type {unknown} */ details) => {
        const failure = { ok: false, code, details }
        FAILURES.add(failure)
        return failure
      },
      schedule: (
        /** @type {number} */ delayMs,
        /** @type {string} */ name,
        /** @type {unknown} */ data
      ) => {
        touch()
        const at = Math.max(call.busyUntil, run.nowUs) + Math.round(delayMs * 1000)
        run.kernel.schedule(at - run.nowUs, {
          type: 'timer',
          node: node.id,
          name,
          data,
          traceId: span.traceId,
          parentSpanId: span.spanId,
        })
      },
      metric: (/** @type {string} */ name, /** @type {number} */ value) => {
        touch()
        run.metrics.push({ atUs: run.nowUs, node: node.id, name, value })
      },
      log: (/** @type {string} */ level, /** @type {unknown[]} */ ...args) => {
        touch()
        run.logs.push({ atUs: run.nowUs, node: node.id, level, args: copy(args) })
      },
    }
    return ctx
  }

  /**
   * A private method call: it runs now, inside the caller's processing, adds its declared
   * latency to the caller's time, and is a child span of the caller's (spec §6).
   * @param {any} node @param {Call} call @param {Span} parent @param {string} name @param {unknown} args
   */
  #private(node, call, parent, name, args) {
    const fn = node.behaviour.private?.[name]
    const declared = node.manifest.methods?.private?.[name]
    if (typeof fn !== 'function' || !declared)
      throw new StrataError('E_METHOD_UNKNOWN', `${node.id} has no private method '${name}'`)
    const startUs = Math.max(call.busyUntil, this.nowUs)
    const span = this.#span(node.id, name, 'private', parent.traceId, parent.spanId, startUs)
    call.busyUntil = startUs + this.#latency(node, declared)
    try {
      const out = fn.call(node.behaviour.private, args, this.#context(node, call, span))
      this.#end(span, 'ok', call.busyUntil)
      return out
    } catch (err) {
      this.#end(span, 'error', call.busyUntil, errorBody(node.id, err).code)
      throw err
    }
  }

  /**
   * A message over the edge leaving a port. With `wait`, a request whose response settles the
   * returned promise; without, an event nobody answers.
   * @param {any} node @param {Call} call @param {Span} span @param {string} portName
   * @param {string} method @param {unknown} body @param {boolean} wait
   */
  #send(node, call, span, portName, method, body, wait) {
    if (!node.manifest.ports.some((/** @type {any} */ p) => p.name === portName))
      throw new StrataError('E_PORT_NOT_FOUND', `${node.id} has no port '${portName}'`)
    const edge =
      this.#edges.get(`${node.id}.${portName}`) ??
      fail('E_SIM_NO_EDGE', `Port '${portName}' of ${node.id} has no edge to send over`)
    const pending = wait ? new Pending(call, this) : null
    const departs = Math.max(call.busyUntil, this.nowUs)
    this.kernel.schedule(departs - this.nowUs + edge.latencyUs, {
      type: 'deliver',
      message: {
        kind: wait ? 'request' : 'event',
        traceId: span.traceId,
        parentSpanId: span.spanId,
        method,
        body: copy(body),
        from: edge.from,
        to: edge.to,
        edge,
        pending,
      },
    })
    return pending
  }

  /**
   * A method's declared latency in whole µs: a distribution, or the property that holds one.
   * @param {any} node @param {{ latency?: unknown } | undefined} declared
   */
  #latency(node, declared) {
    const latency = declared?.latency
    if (latency === undefined || latency === null) return 0
    const dist = typeof latency === 'string' ? node.props[latency] : latency
    const ms = typeof dist === 'number' ? dist : sample(dist, node.latency.nextU32() / 2 ** 32)
    return Math.round(Math.max(0, ms) * 1000)
  }

  /**
   * @param {string} node @param {string} method @param {Span['kind']} kind @param {string} traceId
   * @param {string|null} parentSpanId @param {number} [startUs]
   * @returns {Span}
   */
  #span(node, method, kind, traceId, parentSpanId, startUs = this.nowUs) {
    /** @type {Span} */
    const span = {
      spanId: this.#id(16),
      parentSpanId,
      traceId,
      node,
      method,
      kind,
      startUs,
      endUs: null,
      status: 'running',
    }
    this.spans.push(span)
    return span
  }

  /** A deterministic id of `digits` hex digits. @param {number} digits */
  #id(digits) {
    return (++this.#ids).toString(16).padStart(digits, '0')
  }
}

/**
 * A run of components with the real ctx.
 * @param {{ seed?: number, nodes: RunNode[], edges?: RunEdge[] }} input
 * @example const run = createRun({ seed: 42, nodes, edges }); run.inject({ node: 'api', port: 'in', method: 'get' }); await run.runToEnd()
 */
export function createRun(input) {
  return new Run(input)
}
