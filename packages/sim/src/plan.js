// @ts-check
/**
 * A run's input from the model (spec §6 "Black box or expanded", §7 "Black-box models for
 * composites", task 0406). It holds every component a run reaches, each named by its path of
 * node ids from the root, with its manifest, effective properties and behaviour, and every edge
 * between them.
 *
 * Each composite runs in the mode the run chooses. Expanded, its inner system is planned too,
 * each public method on each port goes to the component its binding names one level down, and
 * each out port leaves from the inner port behind it. As a black box, nothing inside it is
 * planned, and its own behaviour answers, or, for a System, its contract. By default a System
 * runs expanded, and a component opened as a system runs as a black box until a run chooses
 * Expanded (spec §7). Bindings are read through core's resolveBinding, systems through
 * resolveSystem and boundary ports through resolvePort (eng §9).
 */
import { SYSTEM_TYPE_REF } from '../../core/src/index.js'
import { stubNode } from './stubs.js'

/**
 * @typedef {'expanded'|'blackbox'} RunMode
 *
 * @typedef {object} PlanOptions
 * @property {Record<string, RunMode>} [modes]  by component path; by default a System runs
 *   expanded and any other composite as a black box
 * @property {Record<string, object>} [behaviours]  behaviour modules by component type id
 * @property {Scope} [scope]  what runs; the whole project by default
 * @property {Record<string, import('./stubs.js').Stub>} [stubs]  by the id of an edge leaving
 *   the scope, the stub at its end; a fixed stub that answers null at once by default
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
  /** @type {Record<string, Record<string, import('./run.js').Binding>>} */
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
 * @param {any} core @param {Record<string, RunMode>} modes @param {Record<string, object>} behaviours
 */
function planAll(core, modes, behaviours) {
  /** @type {import('./run.js').RunNode[]} */
  const nodes = []
  /** @type {import('./run.js').RunEdge[]} */
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
      /** @type {import('./run.js').RunNode} */
      const runNode = {
        id,
        manifest,
        props: core.effectiveProps(node),
        behaviour: behaviours[manifest.id],
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
 * A run's nodes and edges (spec §11 "Scope", eng §13): the components in its scope, each
 * composite in its mode, the edges between them, and a stub at the end of each edge leaving the
 * scope. Nothing outside the scope is planned. The edges entering it come back as `inbound`, for
 * a scenario or replayed traffic to drive.
 * @param {any} core  a Core, or anything with its read API
 * @param {PlanOptions} [options]
 * @returns {{ nodes: import('./run.js').RunNode[], edges: import('./run.js').RunEdge[], inbound: import('./run.js').RunEdge[] }}
 * @example createRun({ seed: 7, ...planRun(core, { scope: { kind: 'selection', nodes: [serviceId] }, behaviours }) })
 */
export function planRun(
  core,
  { modes = {}, behaviours = {}, scope = { kind: 'project' }, stubs = {} } = {}
) {
  const inside = inScope(scope)
  /** @type {Record<string, RunMode>} */
  const own = scope.kind === 'system' ? { ...modes, [scope.node]: 'expanded' } : modes
  // A black-box stub runs the component outside as a black box.
  const boxing = Object.values(stubs).some(stub => stub.mode === 'blackbox')
  /** @type {Record<string, RunMode>} */
  const boxed = boxing
    ? Object.fromEntries(
        planAll(core, own, behaviours)
          .edges.filter(e => inside(e.from.node) && !inside(e.to.node))
          .filter(e => stubs[e.id]?.mode === 'blackbox')
          .map(e => [e.to.node, /** @type {RunMode} */ ('blackbox')])
      )
    : {}
  const whole = planAll(core, { ...own, ...boxed }, behaviours)
  const nodes = whole.nodes.filter(n => inside(n.id) || n.id in boxed)
  /** @type {import('./run.js').RunEdge[]} */
  const edges = []
  /** @type {import('./run.js').RunEdge[]} */
  const inbound = []
  for (const edge of whole.edges) {
    const [from, to] = [inside(edge.from.node), inside(edge.to.node)]
    if (from && (to || edge.to.node in boxed)) edges.push(edge)
    else if (to) inbound.push(edge)
    else if (from) {
      const target = /** @type {any} */ (whole.nodes.find(n => n.id === edge.to.node)).manifest
      const port = target.ports.find((/** @type {any} */ p) => p.name === edge.to.port)
      const id = `stub:${edge.id}`
      const stub = /** @type {import('./stubs.js').FixedStub} */ (stubs[edge.id] ?? {})
      nodes.push(stubNode(id, port, stub))
      edges.push({ ...edge, to: { node: id, port: edge.to.port } })
    }
  }
  return { nodes, edges, inbound }
}
