// @ts-check
/**
 * A run's input from the model (spec §6 "Black box or expanded", §7 "Black-box models for
 * composites", tasks 0406, 0412, 0417). It holds every component a run reaches, each named by its
 * path of node ids from the root, with its manifest and effective properties, and every edge
 * between them, as plain data: the worker gives each component its behaviour by its type, so the
 * page plans runs without any simulation code (ADR 0018, ADR 0025).
 *
 * Each composite runs in the mode the run chooses. Expanded, its inner system is planned too,
 * each public method on each port goes to the component its binding names one level down, and
 * each out port leaves from the inner port behind it. As a black box, nothing inside it is
 * planned, and its own behaviour answers, or, for a System, its contract. By default a System
 * runs expanded, and a component opened as a system runs as a black box until a run chooses
 * Expanded (spec §7). Bindings are read through core's resolveBinding, systems through
 * resolveSystem and boundary ports through resolvePort (eng §9).
 */
import { SYSTEM_TYPE_REF } from './builtins.js'

/**
 * @typedef {'expanded'|'blackbox'} RunMode
 *
 * @typedef {object} PlanOptions
 * @property {Record<string, RunMode>} [modes]  by component path; by default a System runs
 *   expanded and any other composite as a black box
 * @property {Scope} [scope]  what runs; the whole project by default
 * @property {Record<string, Stub>} [stubs]  by the id of an edge leaving the scope, the stub at
 *   its end; a fixed stub that answers null at once by default
 *
 * @typedef {{ mode?: 'fixed', latency?: unknown, errorRate?: number, errorCode?: string, response?: unknown }} FixedStub
 *   latency in ms, or a distribution of ms; errorRate a fraction; errors fail with errorCode,
 *   UNAVAILABLE by default
 * @typedef {{ mode: 'recorded', calls: any[] }} RecordedStub  a recording run's calls at the edge
 * @typedef {{ mode: 'blackbox' }} BlackBoxStub  the component outside runs as a black box,
 *   without its own downstream calls
 * @typedef {FixedStub|RecordedStub|BlackBoxStub} Stub
 *
 * @typedef {object} PlannedNode
 * @property {string} id  its path of node ids from the root
 * @property {any} manifest
 * @property {Record<string, unknown>} [props]
 * @property {any} [composite]
 * @property {FixedStub|RecordedStub} [stub]  a stub's configuration, which the run answers with
 *
 * @typedef {object} PlannedEdge
 * @property {string} id
 * @property {{ node: string, port: string }} from
 * @property {{ node: string, port: string }} to
 * @property {string|null} [method]
 * @property {Record<string, unknown>} [props]
 *
 * @typedef {{ kind: 'project' } | { kind: 'system', node: string } | { kind: 'selection', nodes: string[] }} Scope
 *   a whole project; one composite and its system at any depth, which runs expanded; or the
 *   components selected, such as a request path's
 */

/**
 * The manifest a run gives a component: its type's, with the ports the model gives it and the
 * methods each exposes, which for a System are the methods bound on its boundary ports.
 * @param {any} core @param {any} node @param {any[]} ports
 */
function manifestOf(core, node, ports) {
  const base = core.manifestOf(node) ?? core.registry.resolve(node.typeRef)
  const exposed = ports.map(p => ({
    ...base.ports?.find((/** @type {any} */ m) => m.name === p.name),
    name: p.name,
    direction: p.direction,
    exposes: core.exposedMethods(p),
  }))
  const bound = Object.fromEntries(exposed.flatMap(p => p.exposes).map(m => [m, {}]))
  return {
    ...base,
    ports: exposed,
    methods: { ...base.methods, public: { ...bound, ...base.methods?.public } },
  }
}

/**
 * Where each public method of an expanded composite goes, by port: the component one level
 * down that its binding names, or why it is unbound.
 * @param {any} core @param {any} node @param {any[]} ports @param {string} id  its path
 */
function bindingsOf(core, node, ports, id) {
  /** @type {Record<string, Record<string, any>>} */
  const bindings = {}
  for (const port of ports) {
    bindings[port.name] = {}
    for (const method of core.exposedMethods(port)) {
      try {
        const next = core.resolveBinding(node.id, method, { port: port.name, levels: 1 })
        const into = core
          .portsOf(next.nodeId)
          .find((/** @type {any} */ p) => core.exposedMethods(p).includes(next.method))
        bindings[port.name][method] = {
          node: `${id}/${next.nodeId}`,
          port: into?.name ?? '',
          method: next.method,
        }
      } catch (err) {
        if (/** @type {any} */ (err).code !== 'E_METHOD_UNBOUND') throw err
        bindings[port.name][method] = { unbound: /** @type {Error} */ (err).message }
      }
    }
  }
  return bindings
}

/**
 * The inner port behind each out port of an expanded composite, whose messages leave through it.
 * @param {any} core @param {any[]} ports @param {string} id  its path
 */
function exitsOf(core, ports, id) {
  /** @type {Record<string, { node: string, port: string }>} */
  const exits = {}
  for (const port of ports) {
    if (port.direction === 'in') continue
    const inner = core.resolvePort(port.id).chain[1]
    if (!inner) continue
    const { nodeId, name } = core.port(inner)
    exits[port.name] = { node: `${id}/${nodeId}`, port: name }
  }
  return exits
}

/**
 * A run's nodes and edges for the whole project, each composite in its mode.
 * @param {any} core @param {Record<string, RunMode>} modes
 */
function planAll(core, modes) {
  /** @type {PlannedNode[]} */
  const nodes = []
  /** @type {PlannedEdge[]} */
  const edges = []
  /** @param {string[]} path  the composites from the root down to the system */
  const plan = path => {
    const { systemId } = core.resolveSystem(path)
    /** @param {string} id */
    const at = id => [...path, id].join('/')
    for (const node of core.nodesOf(systemId)) {
      const id = at(node.id)
      const ports = core.portsOf(node.id)
      const manifest = manifestOf(core, node, ports)
      /** @type {PlannedNode} */
      const runNode = {
        id,
        manifest,
        props: core.effectiveProps(node),
      }
      nodes.push(runNode)
      if (!node.innerSystemRef) continue
      const mode = modes[id] ?? (node.typeRef === SYSTEM_TYPE_REF ? 'expanded' : 'blackbox')
      const inner = core.resolveSystem([...path, node.id])
      runNode.composite = { mode, contract: core.system(inner.systemId).contract ?? {} }
      if (mode === 'blackbox') continue
      runNode.composite.bindings = bindingsOf(core, node, ports, id)
      runNode.composite.exits = exitsOf(core, ports, id)
      plan([...path, node.id])
    }
    for (const edge of core.edgesOf(systemId)) {
      const [from, to] = [core.port(edge.fromPort), core.port(edge.toPort)]
      edges.push({
        id: at(edge.id),
        from: { node: at(from.nodeId), port: from.name },
        to: { node: at(to.nodeId), port: to.name },
        method: edge.method ?? null,
        props: core.effectiveProps(edge),
      })
    }
  }
  plan([])
  return { nodes, edges }
}

/**
 * Whether a component, by its path, is in a scope.
 * @param {Scope} scope
 * @returns {(id: string) => boolean}
 */
function inScope(scope) {
  if (scope.kind === 'system') return id => id === scope.node || id.startsWith(`${scope.node}/`)
  if (scope.kind === 'selection') {
    const selected = new Set(scope.nodes)
    return id => selected.has(id)
  }
  return () => true
}

/**
 * The manifest of a stub standing in for the component at the end of an edge leaving a scope:
 * the port the edge reaches, with its methods and default.
 * @param {{ name: string, exposes?: string[], default?: string }} port
 */
function stubManifest(port) {
  const methods = port.exposes ?? []
  return {
    strataApi: '^1.0',
    id: 'strata.stub',
    name: `Stub of ${port.name}`,
    version: '1.0.0',
    ports: [
      {
        name: port.name,
        direction: 'in',
        exposes: methods,
        ...(port.default ? { default: port.default } : {}),
      },
    ],
    methods: { public: Object.fromEntries(methods.map(m => [m, {}])) },
    state: { replayed: { type: 'map', initial: {} } },
  }
}

/**
 * A run's nodes and edges as plain data (spec §11 "Scope", eng §13): the components in its
 * scope, each composite in its mode, the edges between them, and a stub at the end of each edge
 * leaving the scope, which carries its configuration as `stub`. Nothing outside the scope is
 * planned. The edges entering it come back as `inbound`, for a scenario or replayed traffic to
 * drive. strata-sim's `planRun` gives each component its behaviour.
 * @param {any} core  a Core, or anything with its read API
 * @param {PlanOptions} [options]
 * @returns {{ nodes: PlannedNode[], edges: PlannedEdge[], inbound: PlannedEdge[] }}
 * @example planModel(core, { scope: { kind: 'selection', nodes: [serviceId] } })
 */
export function planModel(core, { modes = {}, scope = { kind: 'project' }, stubs = {} } = {}) {
  const inside = inScope(scope)
  /** @type {Record<string, RunMode>} */
  const own = scope.kind === 'system' ? { ...modes, [scope.node]: 'expanded' } : modes
  // A black-box stub runs the component outside as a black box.
  const boxing = Object.values(stubs).some(stub => stub.mode === 'blackbox')
  /** @type {Record<string, RunMode>} */
  const boxed = boxing
    ? Object.fromEntries(
        planAll(core, own)
          .edges.filter(e => inside(e.from.node) && !inside(e.to.node))
          .filter(e => stubs[e.id]?.mode === 'blackbox')
          .map(e => [e.to.node, /** @type {RunMode} */ ('blackbox')])
      )
    : {}
  const whole = planAll(core, { ...own, ...boxed })
  const nodes = whole.nodes.filter(n => inside(n.id) || n.id in boxed)
  /** @type {PlannedEdge[]} */
  const edges = []
  /** @type {PlannedEdge[]} */
  const inbound = []
  for (const edge of whole.edges) {
    const [from, to] = [inside(edge.from.node), inside(edge.to.node)]
    if (from && (to || edge.to.node in boxed)) edges.push(edge)
    else if (to) inbound.push(edge)
    else if (from) {
      const target = /** @type {any} */ (whole.nodes.find(n => n.id === edge.to.node)).manifest
      const port = target.ports.find((/** @type {any} */ p) => p.name === edge.to.port)
      const id = `stub:${edge.id}`
      const stub = /** @type {FixedStub|RecordedStub} */ (stubs[edge.id] ?? {})
      nodes.push({ id, manifest: stubManifest(port), stub })
      edges.push({ ...edge, to: { node: id, port: edge.to.port } })
    }
  }
  return { nodes, edges, inbound }
}
