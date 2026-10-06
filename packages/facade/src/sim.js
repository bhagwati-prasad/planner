// @ts-check
/**
 * `strata.sim` (spec §11, §12, §18): `start`, a run handle with every control of spec §12 over
 * the worker protocol's run sessions (task 0417, ADR 0025); `compare`, two runs side by side;
 * and `once`, the walking skeleton's one request over one edge, with fixed latencies taken from
 * the model's properties (tasks 0009, 0010).
 *
 * The host carries protocol messages to the kernel (eng §13 "Worker protocol"). The browser app
 * gives a Blob-URL Web Worker (createSimHost), Node a worker_threads worker, and tests strata-sim's
 * in-process host. The facade plans a run with core's planModel and never imports strata-sim, so
 * the main thread carries no simulation code (ADR 0018).
 */
import {
  SIM_PROTOCOL_VERSION,
  StrataError,
  fail,
  planModel,
  statistic,
} from '../../core/src/index.js'
import { behaviourScript } from '../../plugins/src/index.js'
import { CORE, defined } from './internal.js'
import { LATEST } from './debug.js'
import { RunHandle, VIEW, momentOf, pathIn } from './run.js'

/**
 * @typedef {import('../../sim/src/skeleton.js').RunInput} RunInput
 * @typedef {import('../../sim/src/skeleton.js').RunResult} RunResult
 * @typedef {import('../../sim/src/protocol.js').ProtocolMessage} ProtocolMessage
 *
 * @typedef {object} SimHost
 * @property {(message: ProtocolMessage) => Promise<ProtocolMessage>} request
 *   delivers one protocol message to the kernel and resolves with its reply
 * @property {(listener: (message: ProtocolMessage) => void) => () => void} [listen]  messages
 *   no request asked for, such as a playing run's views
 * @property {() => void} [terminate]  stops the worker, so the next request starts a fresh one
 *
 * @typedef {object} RunRequest  a request a run is given (in place of a scenario until R1)
 * @property {any} to  the component it goes to: a node handle, its id or its path
 * @property {string} [port]  its in port, `in` by default
 * @property {string} [method]  the port's default by default
 * @property {string} [path]
 * @property {Record<string, string>} [headers]
 * @property {unknown} [body]
 * @property {number} [sizeBytes]
 * @property {number} [atMs]  when it is sent, in simulated ms; 0 by default
 */

/**
 * Every place a component runs: its paths of node ids from the root, through every system.
 * @param {any} core @param {string[]} [path]
 * @returns {string[]}
 */
function placesOf(core, path = []) {
  return core.nodesOf(core.resolveSystem(path).systemId).flatMap((/** @type {any} */ node) => {
    const at = [...path, node.id]
    return [at.join('/'), ...(node.innerSystemRef ? placesOf(core, at) : [])]
  })
}

/**
 * Where two values differ, as paths.
 * @param {any} a @param {any} b @param {(string|number)[]} path
 * @returns {{ path: (string|number)[], a: unknown, b: unknown }[]}
 */
function differences(a, b, path = []) {
  const list = Array.isArray(a)
  if (a && b && typeof a === 'object' && typeof b === 'object' && list === Array.isArray(b))
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .sort(list ? (x, y) => +x - +y : undefined)
      .flatMap(k => differences(a[k], b[k], [...path, list ? +k : k]))
  return Object.is(a, b) ? [] : [{ path, a, b }]
}

/** Default one-way latency of an edge whose connection type gives none, in microseconds. */
const DEFAULT_EDGE_LATENCY_US = 1000

/** The median of a distribution-valued property, in whole microseconds (values are in ms). */
function medianUs(value) {
  if (value === undefined || value === null) return undefined
  return Math.round(statistic(value, 'median') * 1000)
}

export class SimApi {
  #strata
  #host
  #nextId = 1
  /** @type {Map<string, RunHandle>} */
  #runs = new Map()
  /** @type {Set<string>|null} the components the worker loaded, once it has */
  #loaded = null
  /** @type {import('./run.js').RunLink} */
  #link
  /** @type {RunHandle|null} */
  #latest = null

  /**
   * @param {{ project: any, components: any, transaction: (fn: () => void, options?: object) => unknown }} strata
   * @param {SimHost} [host]  none: simulations fail with E_SIM_NO_HOST
   */
  constructor(strata, host) {
    this.#strata = strata
    this.#host = host
    host?.listen?.(message => {
      if (message.type === 'run.view') this.#runs.get(message.payload.run)?.[VIEW](message.payload)
    })
    this.#link = {
      ask: (type, payload) => this.#ask(type, payload),
      track: (view, handle = new RunHandle(this.#link, view), before) => {
        if (before) this.#runs.delete(before)
        handle[VIEW](view)
        this.#runs.set(view.run, handle)
        return (this.#latest = handle)
      },
      forget: handle => void this.#runs.delete(handle.id),
      keep: commands =>
        commands.length &&
        strata.transaction(() => {
          for (const command of commands) strata.project.dispatch(command)
        }),
    }
  }

  /** The latest run started, branched or restarted, which strata.debug debugs by default. */
  get [LATEST]() {
    return this.#latest
  }

  /** The host, or why there is none. */
  #needHost() {
    return (
      this.#host ??
      fail(
        'E_SIM_NO_HOST',
        'No simulation host: the browser app starts one; in Node, pass simHost to createStrata'
      )
    )
  }

  /**
   * Sends a request and resolves with its reply's payload, or a read's data.
   * @param {string} type @param {object} payload
   */
  async #ask(type, payload) {
    const reply = await this.#needHost().request({
      v: SIM_PROTOCOL_VERSION,
      type,
      id: this.#nextId++,
      payload,
    })
    if (reply.type === 'error')
      throw new StrataError(reply.payload.code, reply.payload.message, reply.payload)
    return type === 'run.read' ? reply.payload.data : reply.payload
  }

  /**
   * Loads the behaviours of the installed components into the worker, before the first run that
   * needs one. A worker loads code once (spec §8), so a component installed later starts a
   * fresh worker.
   * @param {any[]} nodes  a planned run's
   */
  async #load(nodes) {
    const { components } = this.#strata
    const keys = nodes
      .map(n => `${n.manifest.id}@${n.manifest.version}`)
      .filter(key => components.bundle(key))
    if (keys.every(key => this.#loaded?.has(key))) return
    if (this.#loaded) this.#host?.terminate?.()
    const bundles = [...components.list({ kind: 'component' })]
      .filter(c => c.source === 'bundle')
      .map(c => components.bundle(`${c.id}@${c.version}`))
    await this.#ask('load', { scripts: bundles.map(behaviourScript) })
    this.#loaded = new Set(bundles.map(b => `${b.manifest.id}@${b.manifest.version}`))
  }

  /**
   * Starts a run of the open project, ready to play. Its scope is a `{ selection }` of
   * components, or a `{ system }` and everything inside it, or by default the whole project;
   * it takes the requests it is given, its seed, `modes` and `stubs` by path, and how long it
   * lasts, 60 s by default (spec §11, §12). Scenarios arrive in R1.
   * @param {{ requests?: RunRequest[], scope?: { selection?: any[], system?: any }, seed?: number, modes?: Record<string, 'expanded'|'blackbox'>, stubs?: Record<string, object>, durationMs?: number, speed?: number, inspect?: boolean, record?: boolean, scenario?: string }} [options]
   * @returns {Promise<RunHandle>}
   * @example const run = await strata.sim.start({ requests: [{ to: svc, body: { id: 1 } }], seed: 42 })
   */
  async start(options = {}) {
    const { scenario, requests = [], scope, modes = {}, stubs = {}, seed = 1, ...rest } = options
    if (scenario !== undefined)
      fail('UNSUPPORTED', 'Scenarios arrive in R1; until then, give a run its requests')
    const project = this.#strata.project ?? fail('NOT_FOUND', 'No project is open')
    const core = project[CORE]
    const places = placesOf(core)
    /** @param {any} ref */
    const at = ref => (String(ref).includes('/') ? ref : pathIn(ref, places))
    const plan = planModel(core, {
      modes: Object.fromEntries(Object.entries(modes).map(([ref, mode]) => [at(ref), mode])),
      scope: scope?.selection
        ? { kind: 'selection', nodes: scope.selection.map(at) }
        : scope?.system
          ? { kind: 'system', node: at(scope.system) }
          : { kind: 'project' },
      stubs,
    })
    await this.#load(plan.nodes)
    const { durationMs, speed, inspect, record } = rest
    const view = await this.#ask('run.start', {
      input: defined({
        seed,
        nodes: plan.nodes,
        edges: plan.edges,
        inject: requests.map(r =>
          defined({
            node: at(r.to),
            port: r.port ?? 'in',
            method: r.method,
            path: r.path,
            headers: r.headers,
            body: r.body,
            sizeBytes: r.sizeBytes,
            atUs: Math.round((r.atMs ?? 0) * 1000),
          })
        ),
        inspect,
        record,
      }),
      ...defined({ durationMs, speed }),
    })
    return this.#link.track(view)
  }

  /**
   * Two runs side by side: metrics by component and name, and state field by field. Each run
   * is at its own moment, or, given one (`{ event }` or `{ timeMs }`), both move there first,
   * which needs a round trip (spec §12 "Run tree").
   * @param {RunHandle} a @param {RunHandle} b
   * @param {{ event?: number, timeMs?: number }} [moment]
   * @example strata.sim.compare(run, branch)
   */
  compare(a, b, moment) {
    if (moment)
      return this.#ask('run.read', {
        run: a.id,
        what: 'compare',
        args: { other: b.id, moment: momentOf(moment) },
      }).then(async diff => {
        await Promise.all([a.refresh(), b.refresh()])
        return diff
      })
    const [x, y] = [a[VIEW](), b[VIEW]()]
    /** @param {any} m */
    const totals = m => ({ count: m?.count ?? 0, sum: m?.sum ?? 0, last: m?.last ?? null })
    /** @param {any[]} list */
    const byKey = list => new Map(list.map(m => [`${m.node}\u0000${m.name}`, m]))
    const [mx, my] = [byKey(x.metrics), byKey(y.metrics)]
    const metrics = [...new Set([...mx.keys(), ...my.keys()])].sort().flatMap(key => {
      const [p, q] = [totals(mx.get(key)), totals(my.get(key))]
      const { node, name } = mx.get(key) ?? my.get(key)
      return differences(p, q).length ? [{ node, name, a: p, b: q }] : []
    })
    const nodes = [...new Set([...Object.keys(x.components), ...Object.keys(y.components)])].sort()
    const state = nodes.flatMap(node =>
      differences(x.components[node], y.components[node]).map(d => ({ node, ...d }))
    )
    return { metrics, state }
  }

  /**
   * Runs the walking skeleton's one request over an edge of a system. It resolves with the
   * finished run: its trace, its response and its run hash.
   * @param {object} [options]
   * @param {any} [options.system]  the system to run (default: the one the navigator shows)
   * @param {string} [options.edge] the edge the request travels (default: the system's first edge)
   * @param {number} [options.seed] the run seed (default 1)
   * @returns {Promise<RunResult>}
   * @example const run = await strata.sim.once({ seed: 42 }); run.response.atUs
   */
  async once({ system, edge, seed = 1 } = {}) {
    const project = this.#strata.project ?? fail('NOT_FOUND', 'No project is open')
    const input = runInput(system ?? project.nav.current ?? project.root, edge, seed)
    const reply = await this.#needHost().request({
      v: SIM_PROTOCOL_VERSION,
      type: 'run',
      id: this.#nextId++,
      payload: input,
    })
    if (reply.type === 'error')
      throw new StrataError(reply.payload.code, reply.payload.message, reply.payload)
    return reply.payload
  }
}

/**
 * The kernel's input for one system: its components and edges with their fixed latencies, and
 * the request.
 * @param {any} system a SystemHandle
 * @param {string|undefined} edgeId
 * @param {number} seed
 * @returns {RunInput}
 */
function runInput(system, edgeId, seed) {
  const edges = [...system.edges()]
  if (!edges.length)
    fail(
      'E_SIM_NO_EDGE',
      `'${system.name}' has no edge for a request to travel; connect two components first`
    )
  const request = edgeId ? edges.find(e => e.id === edgeId) : edges[0]
  if (!request) fail('E_SIM_EDGE_NOT_FOUND', `Edge '${edgeId}' is not in '${system.name}'`)
  return {
    seed,
    model: {
      components: [...system.nodes()].map(node => ({
        id: node.id,
        name: node.name,
        serviceTimeUs: medianUs(node.props.serviceTime) ?? 0,
      })),
      edges: edges.map(e => ({
        id: e.id,
        from: e.from.node.id,
        to: e.to.node.id,
        latencyUs: medianUs(e.props.latency) ?? DEFAULT_EDGE_LATENCY_US,
      })),
    },
    request: { edge: request.id, method: 'request' },
  }
}
