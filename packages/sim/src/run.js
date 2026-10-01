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
 *
 * Every edge adds its network latency, transmission delay (size ÷ bandwidth) and loss (spec §11
 * "Routing and resources"). A request that gets no response within its edge's timeout is sent
 * again after a backoff that doubles each time and moves by the jitter, and each attempt is a
 * `send` span. Route rules choose which edge leaving a port carries a message (ADR 0019).
 *
 * A composite runs expanded or as a black box (spec §6, task 0406). Expanded, a message to it
 * goes on, with no span of its own, to the component its binding names one level down, and a
 * message from the inner port behind one of its out ports leaves through that port. As a black
 * box, its own behaviour answers, or, for a System, its contract.
 *
 * A component that extends a base type gets its base behaviour (task 0407) under its own: the
 * base's state fields and methods, which its manifest and its entry override, and the base's
 * latency properties for methods its manifest gives no latency.
 *
 * A node with servers, from its manifest's `servers` or its base behaviour's (ADR 0020), admits
 * each public call to a free server. When all are busy the call waits first in, first out; a full
 * backlog refuses it with BACKLOG_FULL, and one that waits past the timeout gives up with
 * TIMEOUT. A call holds its server until its response leaves. `ctx.spend` waits in simulated
 * time (ADR 0021).
 *
 * `ctx.targets(port)` lists the edges leaving a port, and a send that names one of them as its
 * `edge` goes over it, skipping the route rules, so a component can choose its target (ADR 0022).
 */
import {
  StrataError,
  canonicalJson,
  contractValue,
  defaultProps,
  fail,
  isDevelopment,
  normalizeManifest,
  sha256,
  toHex,
} from '../../core/src/index.js'
import { baseLatency, baseOf } from './base.js'
import { Kernel } from './kernel.js'
import { createStreams } from './random.js'
import { parseRoute, pickEdge } from './route.js'
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
 * @property {Composite} [composite]  how a composite runs
 *
 * @typedef {object} Composite  a component with an inner system, in a run (spec §6)
 * @property {'expanded'|'blackbox'} mode
 * @property {Record<string, Record<string, Binding>>} [bindings]  expanded: by port and public
 *   method, where each goes one level down
 * @property {Record<string, { node: string, port: string }>} [exits]  expanded: by out port,
 *   the inner port whose messages leave through it
 * @property {Record<string, { equals?: number, max?: number, min?: number }>} [contract]  its
 *   system's contract, a System's black-box model
 *
 * @typedef {{ node: string, port: string, method: string } | { unbound: string }} Binding
 *
 * @typedef {object} RunInput
 * @property {number} [seed]
 * @property {RunNode[]} nodes
 * @property {RunEdge[]} [edges]
 * @property {boolean} [record]  keep each message that crosses an edge, for recorded stubs and
 *   inbound replay (task 0412)
 * @property {number} [snapshotEvery]  events between snapshots, 10,000 by default (ADR 0023)
 * @property {number} [snapshotBytes]  the memory snapshots may hold, 256 MB by default
 *
 * @typedef {object} RunEdge
 * @property {string} id
 * @property {{ node: string, port: string }} from
 * @property {{ node: string, port: string }} to
 * @property {string|null} [method]  the one method it carries (ADR 0011)
 * @property {EdgeProps} [props]  its connection's property values in canonical units; a
 *   property it lacks costs nothing
 *
 * @typedef {object} EdgeProps
 * @property {unknown} [latency]  one-way network latency in ms, or a distribution of ms
 * @property {number} [bandwidth]  bits per second
 * @property {number} [packetLoss]  the fraction of messages lost
 * @property {number} [payloadSize]  the bytes of a message that sets no size
 * @property {number} [timeout]  ms a request waits for its response; 0 waits for ever
 * @property {number} [retries]  attempts after the first, when one times out
 * @property {number} [retryBackoff]  ms before the first retry, doubling for each one after
 * @property {number} [retryJitter]  the fraction of its backoff a retry may move either way
 * @property {string[]} [route]  the rules for what it carries (ADR 0019)
 *
 * @typedef {object} SendOptions  a message's protocol details (ADR 0019)
 * @property {string} [path]
 * @property {Record<string, string>} [headers]
 * @property {number} [sizeBytes]  its size, over the edge's payloadSize
 * @property {string} [edge]  the edge leaving the port to send over, skipping route rules (ADR 0022)
 *
 * @typedef {{ edge: string, node: string, weight: number }} Target  an edge leaving a port, the
 *   component at its end and its route weight (ADR 0022)
 *
 * @typedef {object} Recording  a message that reached a component over an edge, in a run that
 *   records (task 0412)
 * @property {string} method
 * @property {string|null} path
 * @property {Record<string, string>} headers
 * @property {unknown} body
 * @property {number} atUs  when it arrived
 * @property {{ ok: boolean, body?: unknown, error?: ErrorBody, atUs: number }} [response]  the
 *   response to a request, and when it left
 *
 * @typedef {object} Span  a method call in the trace (OpenTelemetry's shape, spec §11)
 * @property {string} spanId
 * @property {string|null} parentSpanId
 * @property {string} traceId
 * @property {string} node
 * @property {string} method
 * @property {'public'|'private'|'timer'|'send'|'init'} kind  `send` is one attempt of a request
 *   over an edge, a child of the caller's span
 * @property {number} startUs
 * @property {number|null} endUs
 * @property {'running'|'ok'|'error'} status
 * @property {string} [code]  the error code of a failed call
 * @property {string} [edge]  the edge a `send` span went over
 * @property {number} [attempt]  a `send` span's attempt, from 1
 * @property {number} [queuedUs]  how long a public call waited for a server
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
 * A node's servers (ADR 0020): its manifest's, or its base behaviour's, with none busy and none
 * waiting; null when it has neither.
 * @param {any} manifest @param {import('./base.js').BaseBehaviour|null} base
 */
function serversOf(manifest, base) {
  const spec = manifest.servers ?? base?.servers
  return spec ? { spec, busy: 0, queue: [] } : null
}

/**
 * A component's behaviour over its base behaviour: its own methods win.
 * @param {import('./base.js').BaseBehaviour|null} base @param {any} own
 */
function merged(base, own = {}) {
  if (!base) return own
  return { ...own, public: { ...base.public, ...own.public } }
}

/**
 * The service time a System's contract states, in whole µs: its bound on `serviceTime` or on
 * one of its statistics (spec §7 "Black-box models for composites"), or none.
 * @param {Composite} composite
 */
function contractUs({ contract = {} }) {
  const key = Object.keys(contract).find(k => k === 'serviceTime' || k.startsWith('serviceTime.'))
  const ms = key ? Number(contractValue({ contract }, key) ?? 0) : 0
  return Math.round(Math.max(0, ms) * 1000)
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
 * @property {any} node
 * @property {boolean} server  whether it holds one of its node's servers
 *
 * @typedef {RunEdge & { props: EdgeProps, route: import('./route.js').Route, network: import('./random.js').Stream }} Edge
 *
 * A request over an edge, sent once per attempt until one is answered or none are left.
 * @typedef {object} Request
 * @property {string} node  the sender
 * @property {Edge} edge
 * @property {any} message
 * @property {Pending} pending  what the sender's ctx.send returned
 * @property {number} attempts  made so far
 *
 * @typedef {{ request: Request, span: Span, answered: boolean }} Attempt
 *
 * @typedef {{ message: any, method: string|null }} Source  the message a public call answers,
 *   and its method, or null for a black box answering from its contract
 *
 * A snapshot (ADR 0023): the run at a quiet event boundary, where no method is suspended, as
 * plain data that `seek` restores.
 * @typedef {object} Snapshot
 * @property {number} event  events handled before it
 * @property {number} timeUs  simulated time
 * @property {boolean} moved  whether the clock had moved past the last event
 * @property {number} bytes  about how much memory it holds
 * @property {any} data
 */

/** The owner of a promise restored from a snapshot, whose call has finished. */
const FINISHED = /** @type {Call} */ (/** @type {unknown} */ ({ done: true, waiting: 0 }))

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
  /**
   * By edge, every message that reached a component over it, and the response to each request,
   * when the run records (task 0412); null when it does not.
   * @type {Record<string, Recording[]> | null}
   */
  recordings = null
  /**
   * Snapshots, by event and then time, for stepping back and seeking (task 0413, ADR 0023).
   * @type {Snapshot[]}
   */
  snapshots = []
  /** Counts what behaviour code does, so the run can tell when microtasks have settled. */
  activity = 0
  #every = 10_000
  #cap = 256_000_000
  #bytes = 0
  #lastSnapshot = 0
  #lastEventUs = 0
  /** @type {Map<string, Edge>} */
  #edges = new Map()
  /** @type {WeakMap<Span, number>} */
  #spanIndex = new WeakMap()
  /** @type {Set<number>} the indices of spans still running */
  #open = new Set()
  /** @type {WeakMap<object, [string, number]>} where each recording is */
  #recordingAt = new WeakMap()
  /** @type {WeakMap<Reply, number>} */
  #replyIndex = new WeakMap()
  /**
   * Every request injected from outside, in order, with how many events had been handled when it
   * was, so a replay schedules it at the same moment.
   * @type {{ at: number, started: boolean, atUs: number, message: any, reply: Reply }[]}
   */
  #injections = []
  #applied = 0
  #hops = 0
  #calls = 0
  /** @type {string|null} */
  #hopTrace = null
  /** By event: hops and method calls so far, and the trace of the event's hop (spec §12). */
  #marks = { hops: [0], calls: [0], traces: /** @type {(string|null)[]} */ ([null]) }
  #woken = false
  #started = false
  #ids = 0
  /** @type {Map<string, any>} */
  #nodes = new Map()
  /** @type {Map<string, { edges: Edge[], random: import('./random.js').Stream }>} `node.port` → the edges leaving it */
  #ports = new Map()
  /** @type {Map<string, string>} `node.port` inside an expanded composite → the composite's port it leaves by */
  #exits = new Map()
  /** @type {Set<Call>} async calls not yet finished */
  #live = new Set()

  /**
   * @param {RunInput} input
   */
  constructor({
    seed = 1,
    nodes,
    edges = [],
    record = false,
    snapshotEvery = 10_000,
    snapshotBytes = 256_000_000,
  }) {
    if (record) this.recordings = {}
    this.#every = snapshotEvery
    this.#cap = snapshotBytes
    const streams = createStreams(seed)
    const strict = isDevelopment()
    for (const n of nodes) {
      const manifest = normalizeManifest(n.manifest)
      const base = baseOf(manifest)
      const fields = { ...base?.state, .../** @type {any} */ (manifest).state }
      this.#nodes.set(n.id, {
        id: n.id,
        manifest,
        behaviour: merged(base, n.behaviour),
        base,
        props: { ...defaultProps(manifest.properties ?? {}), ...n.props },
        fields,
        strict,
        state: initialState(fields, n),
        composite: n.composite ?? null,
        servers: serversOf(manifest, base),
        random: streams.stream(n.id),
        latency: streams.stream(`${n.id}:latency`),
      })
    }
    for (const n of nodes)
      for (const [port, inner] of Object.entries(n.composite?.exits ?? {}))
        this.#exits.set(`${inner.node}.${inner.port}`, `${n.id}.${port}`)
    for (const e of edges) {
      const key = `${e.from.node}.${e.from.port}`
      const port = this.#ports.get(key) ?? { edges: [], random: streams.stream(`${key}:route`) }
      const props = e.props ?? {}
      const edge = { ...e, props, route: parseRoute(e), network: streams.stream(`${e.id}:edge`) }
      port.edges.push(edge)
      this.#edges.set(e.id, edge)
      this.#ports.set(key, port)
    }
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
   * @param {{ node: string, port: string, method?: string, body?: unknown, atUs?: number } & SendOptions} request
   * @returns {Reply}
   */
  inject({ node, port, method, body, path, headers, sizeBytes = 0, atUs = this.nowUs }) {
    /** @type {Reply} */
    const reply = { status: 'pending', atUs: null }
    this.#replyIndex.set(reply, this.#injections.length)
    // A request injected behind the furthest point reached starts a new future from here.
    this.#forget()
    this.#injections.push({
      at: this.kernel.processed,
      started: this.#started,
      atUs,
      message: {
        kind: 'request',
        parentSpanId: null,
        method,
        path: path ?? null,
        headers: copy(headers ?? {}),
        body: copy(body),
        sizeBytes,
        attempt: 1,
        to: { node, port },
      },
      reply,
    })
    this.#applyInjections()
    return reply
  }

  /** Where the run is: events handled and simulated time. */
  get position() {
    return { event: this.kernel.processed, timeUs: this.kernel.nowUs }
  }

  /** About how much memory the snapshots hold, in bytes. */
  get snapshotBytes() {
    return this.#bytes
  }

  /**
   * Handles events until none are left, or none are due by `untilUs`, when the clock moves to
   * it and later events wait for the next call, or until `untilEvent` events have been handled.
   * A pause at a quiet moment takes a snapshot (ADR 0023).
   * @param {{ maxEvents?: number, untilUs?: number, untilEvent?: number }} [limits]
   */
  async runToEnd({ maxEvents = 10_000_000, untilUs = Infinity, untilEvent = Infinity } = {}) {
    await this.#run({ maxEvents, untilUs, untilEvent })
  }

  /**
   * Handles events up to a limit, or until `stop` says so after one; moves the clock to `untilUs`
   * when no event is left before it; and takes a snapshot at the pause when the run is quiet.
   * @param {{ maxEvents?: number, untilUs?: number, untilEvent?: number }} limits
   * @param {() => boolean} [stop]
   */
  async #run({ maxEvents = 10_000_000, untilUs = Infinity, untilEvent = Infinity }, stop) {
    const handlers = {
      deliver: (/** @type {any} */ e) => this.#deliver(this.#hop(e.message)),
      timer: (/** @type {any} */ e) => this.#timer(e),
      timeout: (/** @type {any} */ e) => this.#timeout(e.attempt),
      retry: (/** @type {any} */ e) => this.#attempt(e.request, this.nowUs),
      spent: (/** @type {any} */ e) => e.pending.settle(true, undefined),
      release: (/** @type {any} */ e) => this.#release(this.#nodes.get(e.node)),
      queueTimeout: (/** @type {any} */ e) => this.#giveUp(e.node, e.waiting),
    }
    await this.#begin()
    let reachedTime = true
    while (this.kernel.processed < untilEvent && this.kernel.nextUs <= untilUs) {
      if (!this.kernel.step(handlers)) break
      if (this.#woken) await this.#settle()
      this.#mark()
      this.#autoSnapshot()
      this.#applyInjections()
      if (this.kernel.processed >= maxEvents)
        fail('INVALID', `The run stopped after ${maxEvents} events`)
      if (stop?.()) {
        reachedTime = false
        break
      }
    }
    if (this.kernel.processed >= untilEvent) reachedTime = false
    if (reachedTime && Number.isFinite(untilUs))
      this.kernel.nowUs = Math.max(this.kernel.nowUs, untilUs)
    if (this.#quiet()) this.#snapshot()
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
    if (message.kind === 'response') return this.#answer(message.attempt, message.ok, message.value)
    const node =
      this.#nodes.get(message.to.node) ??
      fail('E_SIM_COMPONENT_NOT_FOUND', `Component '${message.to.node}' is not in the run`)
    const port = node.manifest.ports.find((/** @type {any} */ p) => p.name === message.to.port)
    const method = message.method ?? port?.default
    if (this.recordings && message.edge && !message.recording) {
      message.recording = {
        method,
        path: message.path,
        headers: copy(message.headers),
        body: copy(message.body),
        atUs: this.nowUs,
      }
      const list = (this.recordings[message.edge.id] ??= [])
      this.#recordingAt.set(message.recording, [message.edge.id, list.length])
      list.push(message.recording)
    }
    let refusal = this.#refusal(node, port, method, message.to.port)
    if (!refusal && node.composite?.mode === 'expanded') {
      const binding = node.composite.bindings?.[port.name]?.[method]
      if (binding && 'node' in binding)
        return this.#deliver({
          ...message,
          method: binding.method,
          to: { node: binding.node, port: binding.port },
        })
      refusal = new StrataError(
        'E_METHOD_UNBOUND',
        binding?.unbound ?? `'${method}' of ${node.id} is not bound to a component inside`
      )
    }
    const span = this.#span(node.id, method ?? '', 'public', message.traceId, message.parentSpanId)
    /** @type {Call['respond']} */
    const respond =
      message.kind === 'event' ? null : (ok, value, atUs) => this.#respond(message, ok, value, atUs)
    if (refusal) return this.#refuse(span, respond, refusal)
    const fn = node.behaviour.public?.[method] ?? node.base?.any
    if (typeof fn === 'function') {
      const declared = node.manifest.methods.public[method]
      const cost = { latency: declared?.latency ?? baseLatency(node.base, method) }
      return this.#serve(node, span, respond, this.#latency(node, cost), { message, method })
    }
    // A black box without behaviour of its own answers from its contract: after the service
    // time the contract states, with no body.
    if (node.composite)
      return this.#serve(node, span, respond, contractUs(node.composite), {
        message,
        method: null,
      })
    this.#refuse(
      span,
      respond,
      new StrataError('E_METHOD_UNKNOWN', `${node.id} has no behaviour for '${method}'`)
    )
  }

  /**
   * Why a node refuses a message on a port, if it does: the port is not its own, or does not
   * expose the method.
   * @param {any} node @param {any} port @param {string|undefined} method @param {string} portName
   */
  #refusal(node, port, method, portName) {
    if (!port) return new StrataError('E_PORT_NOT_FOUND', `${node.id} has no port '${portName}'`)
    if (method && port.exposes?.includes(method) && method in (node.manifest.methods?.public ?? {}))
      return null
    const isPrivate = method && method in (node.manifest.methods?.private ?? {})
    return new StrataError(
      'E_METHOD_NOT_EXPOSED',
      `'${method}' is not exposed by port '${port.name}' of ${node.id}${isPrivate ? '; it is a private method, which no edge reaches' : ''}`
    )
  }

  /**
   * Seeks to a moment: the end of an event, or a simulated time, as a run from time zero would
   * reach it. Going back restores the latest snapshot before the moment and replays forward
   * (ADR 0023).
   * @param {{ event?: number, timeUs?: number }} target
   */
  async seek({ event, timeUs }) {
    await this.#begin()
    if (event !== undefined) {
      const at = this.kernel.processed
      if (event < at || (event === at && this.#moved()))
        this.#restore(this.#latest(s => s.event < event || (s.event === event && !s.moved)))
      if (event > this.kernel.processed) await this.#run({ untilEvent: event })
      return
    }
    if (timeUs === undefined) return fail('INVALID', 'seek takes an event or a time in µs')
    if (timeUs < this.kernel.nowUs) this.#restore(this.#latest(s => s.timeUs <= timeUs))
    await this.#run({ untilUs: timeUs })
  }

  /**
   * Steps forward n units, or back for a negative n (spec §12 "Step units"): events; hops, a
   * message arriving at any component; followed hops, those of one trace; method calls, a public
   * or private call starting or finishing; or slices of simulated time. A step in hops, followed
   * hops or calls ends right after the event that makes it, so stepping forward n then back n
   * comes back to the same moment.
   * @param {number} n
   * @param {'event'|'hop'|'followed'|'call'|'time'} [unit]
   * @param {{ trace?: string, sliceMs?: number }} [options]  the trace a followed hop belongs to,
   *   and the slice of time a time step takes, 10 ms by default
   */
  async step(n, unit = 'event', { trace, sliceMs = 10 } = {}) {
    await this.#begin()
    if (n === 0) return
    const { processed, nowUs } = this.kernel
    if (unit === 'event') return this.seek({ event: Math.max(0, processed + n) })
    if (unit === 'time')
      return this.seek({ timeUs: Math.max(0, nowUs + Math.round(n * sliceMs * 1000)) })
    const marks = this.#marks
    const counts = unit === 'hop' ? marks.hops : unit === 'call' ? marks.calls : null
    if (!counts && unit !== 'followed')
      fail('INVALID', `Step units are event, hop, followed, call and time, not '${unit}'`)
    /** @param {number} k */
    const isUnit = k => k > 0 && (counts ? counts[k] > counts[k - 1] : marks.traces[k] === trace)
    if (n > 0) {
      let passed = 0
      return this.#run(
        {},
        () =>
          (isUnit(this.kernel.processed) && ++passed >= n) ||
          (!counts && !this.#traceAlive(/** @type {string} */ (trace)))
      )
    }
    let need = -n + (isUnit(processed) && !this.#moved() ? 1 : 0)
    let k = processed
    for (; k > 0; k--) if (isUnit(k) && --need === 0) break
    return this.seek({ event: need === 0 ? k : 0 })
  }

  /**
   * A hash of everything a moment of the run holds: its position, every component's state,
   * servers and random streams, the pending events and the trace so far.
   */
  stateHash() {
    const k = this.kernel.save()
    return toHex(
      sha256(
        canonicalJson({
          position: [k.processed, k.nowUs, this.#ids],
          nodes: [...this.#nodes].map(([id, n]) => [
            id,
            n.state,
            n.random.save(),
            n.latency.save(),
            n.servers ? [n.servers.busy, n.servers.queue.length] : null,
          ]),
          ports: [...this.#ports].map(([key, port]) => [key, port.random.save()]),
          edges: [...this.#edges].map(([id, edge]) => [id, edge.network.save()]),
          queue: k.entries.map(e => [e.timeUs, e.priority, e.seq, e.event.type]),
          spans: this.spans,
          outputs: [this.metrics.length, this.logs.length, this.changes.length],
        })
      )
    )
  }

  /**
   * Starts the run: a snapshot before anything happens, the `init` hooks, and the snapshot at
   * time zero that replaces it when no init is waiting part-way.
   */
  async #begin() {
    if (this.#started) return
    if (!this.snapshots.length) this.#snapshot()
    this.#started = true
    this.#init()
    if (this.#woken) await this.#settle()
    this.#marks.calls[0] = this.#calls
    if (this.#quiet()) this.#snapshot(true)
    this.#applyInjections()
  }

  /** Whether no method is suspended part-way, so the run can be captured as data (ADR 0023). */
  #quiet() {
    return this.#live.size === 0
  }

  /** Whether the clock has moved past the last event, to a time a run was asked to reach. */
  #moved() {
    return this.kernel.nowUs !== this.#lastEventUs
  }

  /** Counts a message arriving, and the trace it belongs to. @param {any} message */
  #hop(message) {
    this.#hops++
    this.#hopTrace =
      message.kind === 'response' ? message.attempt.request.message.traceId : message.traceId
    return message
  }

  /** Records, for the event just handled, the step units so far. */
  #mark() {
    const k = this.kernel.processed
    this.#lastEventUs = this.kernel.nowUs
    this.#marks.hops[k] = this.#hops
    this.#marks.calls[k] = this.#calls
    this.#marks.traces[k] = this.#hopTrace
    this.#hopTrace = null
  }

  /** Takes a snapshot when one is due and the run is quiet. */
  #autoSnapshot() {
    if (this.kernel.processed - this.#lastSnapshot >= this.#every && this.#quiet()) this.#snapshot()
  }

  /**
   * Takes a snapshot here, unless one is here already, which `replace` replaces; then thins old
   * snapshots to the memory cap.
   * @param {boolean} [replace]
   */
  #snapshot(replace = false) {
    const { processed: event, nowUs: timeUs } = this.kernel
    const here = this.snapshots.findIndex(s => s.event === event && s.timeUs === timeUs)
    this.#lastSnapshot = event
    if (here >= 0 && !replace) return
    const data = structuredClone(this.#encode())
    /** @type {Snapshot} */
    const snapshot = {
      event,
      timeUs,
      moved: this.#moved(),
      bytes: JSON.stringify(data).length,
      data,
    }
    if (here >= 0) {
      this.#bytes -= this.snapshots[here].bytes
      this.snapshots[here] = snapshot
    } else {
      const after = this.snapshots.findIndex(
        s => s.event > event || (s.event === event && s.timeUs > timeUs)
      )
      this.snapshots.splice(after < 0 ? this.snapshots.length : after, 0, snapshot)
    }
    this.#bytes += snapshot.bytes
    // Thin the old ones: drop the snapshot whose neighbours are closest, the oldest first, never
    // one at time zero or the latest. Seeks stay exact; distant ones replay further.
    while (this.#bytes > this.#cap) {
      let drop = -1
      let gap = Infinity
      for (let i = 1; i < this.snapshots.length - 1; i++) {
        if (this.snapshots[i].event === 0) continue
        const g = this.snapshots[i + 1].event - this.snapshots[i - 1].event
        if (g < gap) [drop, gap] = [i, g]
      }
      if (drop < 0) break
      this.#bytes -= this.snapshots[drop].bytes
      this.snapshots.splice(drop, 1)
    }
  }

  /** The latest snapshot that `fits`. @param {(s: Snapshot) => boolean} fits */
  #latest(fits) {
    for (let i = this.snapshots.length - 1; i >= 0; i--)
      if (fits(this.snapshots[i])) return this.snapshots[i]
    return fail('INVALID', 'No snapshot is early enough')
  }

  /** Schedules the injected requests due by now, generating their trace ids as they go. */
  #applyInjections() {
    while (this.#applied < this.#injections.length) {
      const next = this.#injections[this.#applied]
      if (next.started && (!this.#started || next.at > this.kernel.processed)) return
      this.#applied++
      this.kernel.schedule(next.atUs - this.nowUs, {
        type: 'deliver',
        message: { ...next.message, traceId: this.#id(32), reply: next.reply },
      })
    }
  }

  /**
   * Drops the future beyond this moment, which a request injected now replaces: later snapshots,
   * step marks and injections not yet scheduled.
   */
  #forget() {
    const { processed, nowUs } = this.kernel
    this.snapshots = this.snapshots.filter(
      s => s.event < processed || (s.event === processed && s.timeUs <= nowUs)
    )
    this.#bytes = this.snapshots.reduce((sum, s) => sum + s.bytes, 0)
    for (const list of Object.values(this.#marks))
      list.length = Math.min(list.length, processed + 1)
    this.#injections.length = this.#applied
  }

  /** Whether any pending event or running call belongs to a trace. @param {string} trace */
  #traceAlive(trace) {
    for (const call of this.#live) if (call.span.traceId === trace) return true
    return this.kernel.save().entries.some(e => this.#traceOf(e.event) === trace)
  }

  /** The trace an event belongs to. @param {any} e @returns {string|null} */
  #traceOf(e) {
    switch (e.type) {
      case 'deliver':
        return e.message.kind === 'response'
          ? e.message.attempt.request.message.traceId
          : e.message.traceId
      case 'timer':
        return e.traceId
      case 'timeout':
        return e.attempt.request.message.traceId
      case 'retry':
        return e.request.message.traceId
      case 'spent':
        return e.pending.owner.span?.traceId ?? null
      default:
        return null
    }
  }

  /**
   * The run as plain data, at a quiet moment: nothing in it refers to a suspended method, so a
   * structural copy captures it (ADR 0023). References between its parts become indices and
   * ids: spans by index, edges by id, injected replies by index.
   */
  #encode() {
    /** @type {Map<object, any>} */
    const memo = new Map()
    const k = this.kernel.save()
    const { spans, recordings } = this
    return {
      started: this.#started,
      ids: this.#ids,
      hops: this.#hops,
      calls: this.#calls,
      lastEventUs: this.#lastEventUs,
      applied: this.#applied,
      replies: this.#injections.map(({ reply }) => ({ ...reply })),
      spans: spans.length,
      open: [...this.#open].map(i => {
        const { endUs, status, code, queuedUs } = spans[i]
        return [i, { endUs, status, code, queuedUs }]
      }),
      outputs: [this.metrics.length, this.logs.length, this.changes.length],
      recordings:
        recordings &&
        Object.fromEntries(
          Object.entries(recordings).map(([id, list]) => [
            id,
            { length: list.length, open: list.flatMap((r, i) => (r.response ? [] : [i])) },
          ])
        ),
      nodes: [...this.#nodes].map(([id, n]) => [
        id,
        {
          // A copy, as state may hold views of its own parts, which no structural copy takes.
          state: copy(n.state),
          random: n.random.save(),
          latency: n.latency.save(),
          servers: n.servers && {
            busy: n.servers.busy,
            queue: n.servers.queue.map((/** @type {any} */ w) => this.#encodeWork(w, memo)),
          },
        },
      ]),
      ports: [...this.#ports].map(([key, port]) => [key, port.random.save()]),
      edges: [...this.#edges].map(([id, edge]) => [id, edge.network.save()]),
      nowUs: k.nowUs,
      processed: k.processed,
      seq: k.seq,
      queue: k.entries.map(e => ({ ...e, event: this.#encodeEvent(e.event, memo) })),
    }
  }

  /** @param {any} e @param {Map<object, any>} memo */
  #encodeEvent(e, memo) {
    switch (e.type) {
      case 'deliver':
        return { type: e.type, message: this.#encodeMessage(e.message, memo) }
      case 'timeout':
        return { type: e.type, attempt: this.#encodeAttempt(e.attempt, memo) }
      case 'retry':
        return { type: e.type, request: this.#encodeRequest(e.request, memo) }
      case 'spent':
        // Its call has finished, so settling it does nothing but count.
        return { type: e.type }
      case 'queueTimeout':
        return { type: e.type, node: e.node, waiting: this.#encodeWork(e.waiting, memo) }
      default:
        return e
    }
  }

  /** @param {any} m @param {Map<object, any>} memo */
  #encodeMessage(m, memo) {
    if (m.kind === 'response') {
      const { code, message, details } = m.ok ? {} : m.value
      return {
        kind: m.kind,
        attempt: this.#encodeAttempt(m.attempt, memo),
        ok: m.ok,
        value: m.ok ? m.value : { code, message, details },
      }
    }
    return {
      ...m,
      edge: m.edge?.id,
      current: m.current && this.#encodeAttempt(m.current, memo),
      reply: m.reply ? this.#replyIndex.get(m.reply) : undefined,
      recording: m.recording ? this.#recordingAt.get(m.recording) : undefined,
    }
  }

  /** @param {Attempt} a @param {Map<object, any>} memo */
  #encodeAttempt(a, memo) {
    if (memo.has(a)) return memo.get(a)
    const out = { request: null, span: this.#spanIndex.get(a.span), answered: a.answered }
    memo.set(a, out)
    out.request = this.#encodeRequest(a.request, memo)
    return out
  }

  /** @param {Request} r @param {Map<object, any>} memo */
  #encodeRequest(r, memo) {
    if (memo.has(r)) return memo.get(r)
    const out = { node: r.node, edge: r.edge.id, message: null, attempts: r.attempts }
    memo.set(r, out)
    out.message = this.#encodeMessage(r.message, memo)
    return out
  }

  /** @param {any} w @param {Map<object, any>} memo */
  #encodeWork(w, memo) {
    if (memo.has(w)) return memo.get(w)
    const out = {
      span: this.#spanIndex.get(w.span),
      ownUs: w.ownUs,
      at: w.at,
      source: { message: this.#encodeMessage(w.source.message, memo), method: w.source.method },
    }
    memo.set(w, out)
    return out
  }

  /**
   * Puts the run back as a snapshot holds it: the clock, the queue, every component's state,
   * servers and random streams, and the trace and outputs as they were then.
   * @param {Snapshot} snapshot
   */
  #restore(snapshot) {
    const d = structuredClone(snapshot.data)
    /** @type {Map<object, any>} */
    const memo = new Map()
    this.#live.clear()
    this.#woken = false
    this.#started = d.started
    this.#ids = d.ids
    this.#hops = d.hops
    this.#calls = d.calls
    this.#hopTrace = null
    this.#lastEventUs = d.lastEventUs
    this.#lastSnapshot = snapshot.event
    this.spans.length = d.spans
    this.#open = new Set(d.open.map((/** @type {[number, any]} */ [i]) => i))
    for (const [i, fields] of d.open) {
      const span = /** @type {any} */ (this.spans[i])
      for (const key of ['endUs', 'status', 'code', 'queuedUs'])
        if (fields[key] === undefined) delete span[key]
        else span[key] = fields[key]
    }
    ;[this.metrics.length, this.logs.length, this.changes.length] = d.outputs
    for (const [id, list] of Object.entries(this.recordings ?? {})) {
      const kept = d.recordings?.[id]
      list.length = kept?.length ?? 0
      for (const i of kept?.open ?? []) delete list[i].response
    }
    this.#injections.forEach(({ reply }, i) => {
      for (const key of Object.keys(reply)) delete (/** @type {any} */ (reply)[key])
      Object.assign(reply, d.replies[i] ?? { status: 'pending', atUs: null })
    })
    this.#applied = d.applied
    for (const [id, n] of d.nodes) {
      const node = this.#nodes.get(id)
      node.state = n.state
      node.random.load(n.random)
      node.latency.load(n.latency)
      if (node.servers) {
        node.servers.busy = n.servers.busy
        node.servers.queue = n.servers.queue.map((/** @type {any} */ w) =>
          this.#decodeWork(w, memo)
        )
      }
    }
    for (const [key, saved] of d.ports) this.#ports.get(key)?.random.load(saved)
    for (const [id, saved] of d.edges) this.#edges.get(id)?.network.load(saved)
    this.kernel.load({
      nowUs: d.nowUs,
      processed: d.processed,
      seq: d.seq,
      entries: d.queue.map((/** @type {any} */ e) => ({
        ...e,
        event: this.#decodeEvent(e.event, memo),
      })),
    })
    this.#applyInjections()
  }

  /** @param {any} e @param {Map<object, any>} memo */
  #decodeEvent(e, memo) {
    switch (e.type) {
      case 'deliver':
        return { type: e.type, message: this.#decodeMessage(e.message, memo) }
      case 'timeout':
        return { type: e.type, attempt: this.#decodeAttempt(e.attempt, memo) }
      case 'retry':
        return { type: e.type, request: this.#decodeRequest(e.request, memo) }
      case 'spent':
        return { type: e.type, pending: new Pending(FINISHED, this) }
      case 'queueTimeout':
        return { type: e.type, node: e.node, waiting: this.#decodeWork(e.waiting, memo) }
      default:
        return e
    }
  }

  /** @param {any} m @param {Map<object, any>} memo */
  #decodeMessage(m, memo) {
    if (m.kind === 'response')
      return {
        kind: m.kind,
        attempt: this.#decodeAttempt(m.attempt, memo),
        ok: m.ok,
        value: m.ok ? m.value : new CallError(m.value),
      }
    return {
      ...m,
      edge: m.edge === undefined ? undefined : this.#edges.get(m.edge),
      current: m.current && this.#decodeAttempt(m.current, memo),
      reply: m.reply === undefined ? undefined : this.#injections[m.reply].reply,
      recording: m.recording && this.recordings?.[m.recording[0]][m.recording[1]],
    }
  }

  /** @param {any} a @param {Map<object, any>} memo */
  #decodeAttempt(a, memo) {
    if (memo.has(a)) return memo.get(a)
    const out = { request: null, span: this.spans[a.span], answered: a.answered }
    memo.set(a, out)
    out.request = this.#decodeRequest(a.request, memo)
    return out
  }

  /** @param {any} r @param {Map<object, any>} memo */
  #decodeRequest(r, memo) {
    if (memo.has(r)) return memo.get(r)
    const out = {
      node: r.node,
      edge: this.#edges.get(r.edge),
      message: null,
      pending: new Pending(FINISHED, this),
      attempts: r.attempts,
    }
    memo.set(r, out)
    out.message = this.#decodeMessage(r.message, memo)
    return out
  }

  /** @param {any} w @param {Map<object, any>} memo */
  #decodeWork(w, memo) {
    if (memo.has(w)) return memo.get(w)
    const message = this.#decodeMessage(w.source.message, memo)
    const out = {
      span: this.spans[w.span],
      ownUs: w.ownUs,
      at: w.at,
      source: { message, method: w.source.method },
      respond:
        message.kind === 'event'
          ? null
          : (/** @type {boolean} */ ok, /** @type {unknown} */ value, /** @type {number} */ atUs) =>
              this.#respond(message, ok, value, atUs),
    }
    memo.set(w, out)
    return out
  }

  /** Runs each behaviour's `init` hook once, at the start, as an `init` span (spec §8). */
  #init() {
    for (const node of this.#nodes.values()) {
      const fn = node.behaviour.init
      if (typeof fn !== 'function') continue
      const span = this.#span(node.id, 'init', 'init', this.#id(32), null)
      this.#start(node, span, null, 0, call =>
        fn.call(node.behaviour, this.#context(node, call, span))
      )
    }
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
    const call = {
      busyUntil: this.nowUs,
      ownUs,
      waiting: 0,
      done: false,
      span,
      respond,
      node,
      server: false,
    }
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
    // A call without a server may have grown a count counted from state.
    if (!call.server) return this.#drain(call.node)
    if (atUs > this.nowUs)
      this.kernel.schedule(atUs - this.nowUs, { type: 'release', node: call.node.id })
    else this.#release(call.node)
  }

  /**
   * Runs a public call on a free server of its node, queues it when all are busy, or refuses it
   * when the backlog is full (ADR 0020). A node without servers runs every call at once.
   * @param {any} node @param {Span} span @param {Call['respond']} respond @param {number} ownUs
   * @param {Source} source
   */
  #serve(node, span, respond, ownUs, source) {
    const servers = node.servers
    if (!servers || this.#setting(node, 'count') === Infinity)
      return this.#start(node, span, respond, ownUs, this.#body(node, span, source))
    const work = { span, respond, ownUs, source, at: this.nowUs }
    if (!servers.queue.length && servers.busy < this.#setting(node, 'count'))
      return this.#admit(node, work)
    if (servers.queue.length >= this.#setting(node, 'backlog'))
      return this.#refuse(
        span,
        respond,
        new CallError({
          code: 'BACKLOG_FULL',
          message: `${node.id} has no free server and a full backlog`,
        })
      )
    servers.queue.push(work)
    this.#waiting(node)
    const timeoutMs = this.#setting(node, 'timeout')
    if (Number.isFinite(timeoutMs) && timeoutMs > 0)
      this.kernel.schedule(Math.round(timeoutMs * 1000), {
        type: 'queueTimeout',
        node: node.id,
        waiting: work,
      })
  }

  /**
   * A server setting of a node: its count (the product of its entries, when it has them all), its
   * backlog or its timeout, or Infinity when it lacks one.
   * @param {any} node @param {'count'|'backlog'|'timeout'} key
   */
  #setting(node, key) {
    const spec = node.servers.spec
    const entries = key === 'count' ? spec.count : spec[key] === undefined ? [] : [spec[key]]
    const values = entries.map((/** @type {string|number} */ entry) =>
      typeof entry === 'number'
        ? entry
        : entry.startsWith('state.')
          ? node.state[entry.slice(6)]
          : node.props[entry]
    )
    if (!values.length || values.some((/** @type {unknown} */ v) => typeof v !== 'number'))
      return Infinity
    return values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a * b, 1)
  }

  /** Starts queued work on a free server. @param {any} node @param {any} work */
  #admit(node, work) {
    const { servers } = node
    servers.busy++
    this.#busy(node)
    if (this.nowUs > work.at) work.span.queuedUs = this.nowUs - work.at
    const body = this.#body(node, work.span, work.source)
    this.#start(node, work.span, work.respond, work.ownUs, call => {
      call.server = true
      return body(call)
    })
  }

  /**
   * What a call runs: the public method's behaviour with its message, or, for a black box
   * without behaviour (`method` null), nothing. It is rebuilt from data, so a snapshot can hold
   * calls waiting for a server.
   * @param {any} node @param {Span} span @param {Source} source
   * @returns {(call: Call) => unknown}
   */
  #body(node, span, { message, method }) {
    const fn = method === null ? null : (node.behaviour.public?.[method] ?? node.base?.any)
    if (typeof fn !== 'function') return () => null
    const msg = {
      kind: message.kind,
      traceId: message.traceId,
      spanId: span.spanId,
      parentSpanId: message.parentSpanId,
      method,
      path: message.path,
      headers: message.headers,
      body: message.body,
      sizeBytes: message.sizeBytes,
      attempt: message.attempt,
    }
    return call => fn.call(node.behaviour.public, msg, this.#context(node, call, span))
  }

  /** Frees a server, and starts the calls waiting that now fit. @param {any} node */
  #release(node) {
    node.servers.busy--
    this.#busy(node)
    this.#drain(node)
  }

  /** Starts the calls waiting that fit on free servers. @param {any} node */
  #drain(node) {
    const { servers } = node
    while (servers?.queue.length && servers.busy < this.#setting(node, 'count')) {
      const work = servers.queue.shift()
      this.#waiting(node)
      this.#admit(node, work)
    }
  }

  /** Gives up on a call that is still waiting at its timeout. @param {string} id @param {any} work */
  #giveUp(id, work) {
    const { servers } = this.#nodes.get(id)
    const at = servers.queue.indexOf(work)
    if (at < 0) return
    servers.queue.splice(at, 1)
    this.#waiting(this.#nodes.get(id))
    this.#refuse(
      work.span,
      work.respond,
      new CallError({ code: 'TIMEOUT', message: `${id} had no free server for its timeout` })
    )
  }

  /** Records a node's waiting calls: as `backlog`, or under the name its servers give them. @param {any} node */
  #waiting(node) {
    const { spec, queue } = node.servers
    this.#gauge(node, spec.metrics?.waiting ?? 'backlog', queue.length)
  }

  /** Records a node's utilisation, and its busy servers under the name its servers give them. @param {any} node */
  #busy(node) {
    const { spec, busy } = node.servers
    this.#gauge(node, 'utilisation', busy / this.#setting(node, 'count'))
    if (spec.metrics?.busy) this.#gauge(node, spec.metrics.busy, busy)
  }

  /** Records a metric the run measures for a node. @param {any} node @param {string} name @param {number} value */
  #gauge(node, name, value) {
    this.metrics.push({ atUs: this.nowUs, node: node.id, name, value })
  }

  /** @param {Span} span @param {Call['respond']} respond @param {StrataError|CallError} err */
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
    this.#open.delete(/** @type {number} */ (this.#spanIndex.get(span)))
    if (span.kind === 'public' || span.kind === 'private') this.#calls++
  }

  /**
   * Sends the response of a request: to the reply of an injected one, or back over its edge.
   * @param {any} message @param {boolean} ok @param {unknown} value @param {number} atUs
   */
  #respond(message, ok, value, atUs) {
    if (message.recording)
      message.recording.response = ok
        ? { ok, body: copy(value), atUs }
        : { ok, error: /** @type {ErrorBody} */ (copy(value)), atUs }
    if (message.reply) {
      Object.assign(
        message.reply,
        ok ? { status: 'ok', atUs, body: value } : { status: 'error', atUs, error: value }
      )
      return
    }
    const edge = /** @type {Edge} */ (message.edge)
    this.#cross(edge, atUs, edge.props.payloadSize ?? 0, {
      type: 'deliver',
      message: {
        kind: 'response',
        attempt: message.current,
        ok,
        value: ok ? value : new CallError(/** @type {ErrorBody} */ (value)),
      },
    })
  }

  /**
   * A response reaching its sender: it settles the request, unless its attempt timed out.
   * @param {Attempt} attempt @param {boolean} ok @param {unknown} value
   */
  #answer(attempt, ok, value) {
    if (attempt.answered) return
    attempt.answered = true
    this.#end(
      attempt.span,
      ok ? 'ok' : 'error',
      this.nowUs,
      ok ? undefined : /** @type {CallError} */ (value).code
    )
    attempt.request.pending.settle(ok, value)
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
        /** @type {unknown} */ args,
        /** @type {SendOptions} */ options
      ) => (touch(), run.#send(node, call, span, port, method, args, true, options)),
      /** The edges leaving a port, in the order the run was given them (ADR 0022). */
      targets: (/** @type {string} */ port) => (touch(), run.#targets(node, port)),
      emit: (
        /** @type {string} */ port,
        /** @type {string} */ method,
        /** @type {unknown} */ args,
        /** @type {SendOptions} */ options
      ) => {
        touch()
        run.#send(node, call, span, port, method, args, false, options)
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
          data: copy(data),
          traceId: span.traceId,
          parentSpanId: span.spanId,
        })
      },
      /** Waits `dist` ms, or a draw from it, in simulated time, holding the call's server (ADR 0021). */
      spend: (/** @type {unknown} */ dist) => {
        touch()
        const ms = typeof dist === 'number' ? dist : sample(dist, node.latency.nextU32() / 2 ** 32)
        const pending = new Pending(call, run)
        const at = Math.max(call.busyUntil, run.nowUs) + Math.round(Math.max(0, ms) * 1000)
        run.kernel.schedule(at - run.nowUs, { type: 'spent', pending })
        return pending
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
   * A message from a port, over the edge its route rules choose. With `wait`, a request whose
   * response settles the returned promise; without, an event nobody answers.
   * @param {any} node @param {Call} call @param {Span} span @param {string} portName
   * @param {string} method @param {unknown} body @param {boolean} wait
   * @param {SendOptions} [options]
   */
  #send(node, call, span, portName, method, body, wait, options = {}) {
    const port =
      this.#port(node, portName) ??
      fail('E_SIM_NO_EDGE', `Port '${portName}' of ${node.id} has no edge to send over`)
    const message = {
      kind: wait ? 'request' : 'event',
      traceId: span.traceId,
      parentSpanId: span.spanId,
      method,
      path: options.path ?? null,
      headers: copy(options.headers ?? {}),
      body: copy(body),
      sizeBytes: options.sizeBytes,
    }
    const edge =
      options.edge != null
        ? (port.edges.find((/** @type {Edge} */ e) => e.id === options.edge) ??
          fail(
            'E_SIM_EDGE_NOT_FOUND',
            `Edge '${options.edge}' does not leave port '${portName}' of ${node.id}`
          ))
        : (pickEdge(port.edges, message, () => port.random.nextU32() / 2 ** 32) ??
          fail(
            'E_SIM_NO_ROUTE',
            `No edge leaving port '${portName}' of ${node.id} carries '${method}'${message.path ? ` to ${message.path}` : ''}; check the edges' route rules`
          ))
    Object.assign(message, {
      // A message that names no method calls the edge's (ADR 0019).
      method: method ?? edge.method ?? undefined,
      sizeBytes: message.sizeBytes ?? edge.props.payloadSize ?? 0,
      to: edge.to,
      edge,
    })
    const departs = Math.max(call.busyUntil, this.nowUs)
    if (!wait) {
      this.#cross(edge, departs, message.sizeBytes, {
        type: 'deliver',
        message: { ...message, attempt: 1 },
      })
      return null
    }
    /** @type {Request} */
    const request = { node: node.id, edge, message, pending: new Pending(call, this), attempts: 0 }
    this.#attempt(request, departs)
    return request.pending
  }

  /**
   * A node's port and the edges leaving it, or undefined when none do.
   * @param {any} node @param {string} portName
   */
  #port(node, portName) {
    if (!node.manifest.ports.some((/** @type {any} */ p) => p.name === portName))
      throw new StrataError('E_PORT_NOT_FOUND', `${node.id} has no port '${portName}'`)
    return this.#leaving(`${node.id}.${portName}`)
  }

  /**
   * The edges leaving a port, as targets (ADR 0022).
   * @param {any} node @param {string} portName
   * @returns {Target[]}
   */
  #targets(node, portName) {
    return (this.#port(node, portName)?.edges ?? []).map((/** @type {Edge} */ e) => ({
      edge: e.id,
      node: e.to.node,
      weight: e.route.weight,
    }))
  }

  /**
   * The edges leaving a port: its own, or, for the inner port behind an expanded composite's
   * out port, those leaving the composite's port.
   * @param {string} key  `node.port`
   */
  #leaving(key) {
    for (let at = /** @type {string|undefined} */ (key); at; at = this.#exits.get(at)) {
      const port = this.#ports.get(at)
      if (port) return port
    }
  }

  /**
   * Sends a request once more, as a `send` span, and starts its timeout.
   * @param {Request} request @param {number} departsUs
   */
  #attempt(request, departsUs) {
    const { edge, message } = request
    const attempt = ++request.attempts
    const span = this.#span(
      request.node,
      message.method,
      'send',
      message.traceId,
      message.parentSpanId,
      departsUs
    )
    Object.assign(span, { edge: edge.id, attempt })
    /** @type {Attempt} */
    const current = { request, span, answered: false }
    // Each attempt but the last gets its own copy of the body, in case the callee changes it.
    const body = attempt <= (edge.props.retries ?? 0) ? copy(message.body) : message.body
    this.#cross(edge, departsUs, message.sizeBytes, {
      type: 'deliver',
      message: { ...message, body, attempt, current },
    })
    const timeout = edge.props.timeout ?? 0
    if (timeout > 0)
      this.kernel.schedule(departsUs - this.nowUs + Math.round(timeout * 1000), {
        type: 'timeout',
        attempt: current,
      })
  }

  /**
   * An attempt's timeout: unless it was answered, it fails, and the request is sent again after
   * its backoff, or fails with E_SIM_TIMEOUT when no retries are left.
   * @param {Attempt} current
   */
  #timeout(current) {
    if (current.answered) return
    current.answered = true
    this.#end(current.span, 'error', this.nowUs, 'E_SIM_TIMEOUT')
    const { request } = current
    const { edge, message } = request
    const { retries = 0, retryBackoff = 0, retryJitter = 0, timeout } = edge.props
    if (request.attempts <= retries) {
      const u = retryJitter > 0 ? edge.network.nextU32() / 2 ** 32 : 0.5
      const ms = retryBackoff * 2 ** (request.attempts - 1) * (1 + retryJitter * (2 * u - 1))
      this.kernel.schedule(Math.round(ms * 1000), { type: 'retry', request })
      return
    }
    request.pending.settle(
      false,
      new CallError({
        code: 'E_SIM_TIMEOUT',
        message: `'${message.method}' from ${request.node} over edge ${edge.id} got no response: ${request.attempts} attempts of ${timeout} ms each timed out`,
        details: { edge: edge.id, attempts: request.attempts, timeoutMs: timeout },
      })
    )
  }

  /**
   * Puts a message on an edge at `departsUs`. It arrives after the edge's latency and its
   * transmission delay, size ÷ bandwidth, unless the edge loses it.
   * @param {Edge} edge @param {number} departsUs @param {number} sizeBytes
   * @param {import('./kernel.js').SimEvent} event
   */
  #cross(edge, departsUs, sizeBytes, event) {
    const { latency, bandwidth = 0, packetLoss = 0 } = edge.props
    const random = () => edge.network.nextU32() / 2 ** 32
    const ms =
      latency === undefined || latency === null
        ? 0
        : typeof latency === 'number'
          ? latency
          : sample(latency, random())
    if (packetLoss > 0 && random() < packetLoss) return
    const transmitUs = bandwidth > 0 ? (sizeBytes * 8 * 1_000_000) / bandwidth : 0
    this.kernel.schedule(
      departsUs - this.nowUs + Math.round(Math.max(0, ms) * 1000 + transmitUs),
      event
    )
  }

  /**
   * A method's declared latency in whole µs: a distribution, or the property that holds one, or
   * the first of several properties that the component has.
   * @param {any} node @param {{ latency?: unknown } | undefined} declared
   */
  #latency(node, declared) {
    const latency = declared?.latency
    if (latency === undefined || latency === null) return 0
    const names = typeof latency === 'string' ? [latency] : Array.isArray(latency) ? latency : null
    const dist = names ? names.map(k => node.props[k]).find(v => v != null) : latency
    if (dist === undefined || dist === null) return 0
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
    this.#spanIndex.set(span, this.spans.length)
    this.#open.add(this.spans.length)
    this.spans.push(span)
    if (kind === 'public' || kind === 'private') this.#calls++
    return span
  }

  /** A deterministic id of `digits` hex digits. @param {number} digits */
  #id(digits) {
    return (++this.#ids).toString(16).padStart(digits, '0')
  }
}

/**
 * A run of components with the real ctx. With `record`, it keeps each message that crosses an
 * edge in `run.recordings`, for recorded stubs and inbound replay (task 0412).
 * @param {RunInput} input
 * @example const run = createRun({ seed: 42, nodes, edges }); run.inject({ node: 'api', port: 'in', method: 'get' }); await run.runToEnd()
 */
export function createRun(input) {
  return new Run(input)
}
