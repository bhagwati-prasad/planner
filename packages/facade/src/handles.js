/**
 * Handles: small live objects over model entities, the vocabulary of the console API
 * (spec §16). A handle stores only ids and reads the model on every access, so it always
 * shows current state; using a handle whose entity was deleted throws NOT_FOUND.
 *
 * Every change goes through `project.dispatch`, i.e. through the command bus.
 */
import { SYSTEM_TYPE_REF, fail, nodeKind } from '../../core/src/index.js'
import { Collection } from './collection.js'
import { CORE, INSPECT, defined } from './internal.js'
import { pasteClip } from './clipboard.js'

/** @typedef {import('./projects.js').ProjectHandle} ProjectHandle */
/** @typedef {import('../../core/src/index.js').Core} Core */
/**
 * A component method as `methods()` lists it: its declared spec plus these fields.
 * @typedef {{ name: string, visibility: 'public'|'private', ports: string[], [key: string]: unknown }} MethodInfo
 */

/** @param {ProjectHandle} project @returns {Core} */
const coreOf = project => project[CORE]

export class Handle {
  #project
  #id

  /** @param {ProjectHandle} project @param {string} id */
  constructor(project, id) {
    this.#project = project
    this.#id = id
  }

  get id() {
    return this.#id
  }
  /** The project this handle belongs to. */
  get project() {
    return this.#project
  }
  /** @internal The project's core; not reachable from outside the facade. */
  get [CORE]() {
    return coreOf(this.#project)
  }

  /**
   * True when both handles name the same entity of the same project.
   * @param {unknown} other
   * @example strata.$.equals(svc)
   */
  equals(other) {
    return other instanceof Handle && other.id === this.#id && other.project === this.#project
  }

  /**
   * The handle as plain data (its row), for JSON.stringify.
   * @example JSON.stringify(svc)
   */
  toJSON() {
    return this.toRow()
  }
  /**
   * A row describing the entity, for console.table.
   * @example console.table([svc.toRow()])
   */
  toRow() {
    return { id: this.#id }
  }
  /**
   * A short label such as Node<Orders>.
   * @example String(svc)
   */
  toString() {
    return `${this.constructor.name.replace('Handle', '')}<${this.#id}>`
  }
  [INSPECT]() {
    return this.toString()
  }
}

// -------------------------------------------------------------------------------------------
// Systems
// -------------------------------------------------------------------------------------------

export class SystemHandle extends Handle {
  #via
  #readOnly

  /**
   * @param {ProjectHandle} project
   * @param {string} id
   * @param {{ via?: string|null, readOnly?: boolean }} [options] via: composite node it was reached through
   */
  constructor(project, id, { via = null, readOnly = false } = {}) {
    super(project, id)
    this.#via = via
    this.#readOnly = readOnly
  }

  /** The system entity (frozen plain object). */
  get entity() {
    return this[CORE].require('system', this.id)
  }
  get name() {
    return this.entity.name
  }
  get levelTag() {
    return this.entity.levelTag
  }
  get description() {
    return this.entity.description
  }
  get contract() {
    return this.entity.contract
  }
  get tags() {
    return this.entity.tags
  }
  get isRoot() {
    return this.id === this[CORE].rootSystemId
  }
  /** A library system: placeable by reference, not the root and not owned by a composite. */
  get isLibrary() {
    return !this.isRoot && !this.entity.ownerNodeId
  }
  /** Composite node this handle was reached through, if any. */
  get via() {
    return this.#via ? new NodeHandle(this.project, this.#via) : null
  }
  /** True when reached through a by-reference placement: edit the source system instead. */
  get readOnly() {
    return this.#readOnly
  }
  /** The composite node that owns this system (placed by value), or null. */
  get owner() {
    const ownerId = this.entity.ownerNodeId
    return ownerId ? new NodeHandle(this.project, ownerId) : null
  }

  #writable() {
    if (this.#readOnly) {
      fail(
        'E_SYSTEM_READONLY',
        `'${this.name}' is placed by reference and is read-only here. Edit the source with project.system('${this.name}'), or detach the placement to get an editable copy.`
      )
    }
  }

  #node(id) {
    return new NodeHandle(this.project, id, { readOnly: this.#readOnly })
  }

  /**
   * Adds a component.
   * @param {string} type component id or short name, e.g. 'service' or 'acme.message-queue@1.2.0'
   * @param {{ name?: string, props?: object, tags?: string[], owner?: string|null, status?: string, description?: string, at?: {x: number, y: number}, id?: string }} [options]
   * @example const svc = root.add('service', { name: 'Orders', props: { concurrency: 64 } })
   */
  add(type, { at, ...fields } = {}) {
    this.#writable()
    const id = this.project.transaction(() => {
      const nodeId = this.project.dispatch({
        type: 'component.add',
        payload: defined({ systemId: this.id, typeRef: type, ...fields }),
      })
      if (at) this.#place(nodeId, at)
      return nodeId
    })
    return this.#node(id)
  }

  /**
   * Places another system inside this one as a composite node.
   * @param {SystemHandle|string} system handle, id or name
   * @param {{ placement?: 'reference'|'value', name?: string, at?: {x: number, y: number} }} [options]
   * @example root.place('Auth', { placement: 'value' })
   */
  place(system, { placement = 'reference', name, at } = {}) {
    this.#writable()
    const systemRef = resolveSystemId(this.project, system)
    const id = this.project.transaction(() => {
      const nodeId = this.project.dispatch({
        type: 'node.place',
        payload: defined({ systemId: this.id, systemRef, placement, name }),
      })
      if (at) this.#place(nodeId, at)
      return nodeId
    })
    return this.#node(id)
  }

  #place(nodeId, at) {
    const [view] = this[CORE].viewsOf(this.id)
    this.project.dispatch({
      type: 'view.layout',
      payload: { viewId: view.id, set: { [nodeId]: { x: at.x, y: at.y } } },
    })
  }

  /**
   * Connects two ports. Each end may be a PortHandle, a port id, 'Node.port', or a NodeHandle
   * (the compatible port is picked for you).
   * @param {PortHandle|NodeHandle|string} from
   * @param {PortHandle|NodeHandle|string} to
   * @param {{ type?: string, method?: string, props?: object, label?: string, id?: string }} [options]
   *   method: the public method the edge calls, one the target port exposes (spec §6)
   * @example root.connect(svc.port('db'), db.port('in'), { type: 'db-protocol', method: 'insert' })
   */
  connect(from, to, { type, method, props, label, id } = {}) {
    this.#writable()
    const [fromPort, toPort] = pickPorts(this, from, to, type)
    const edgeId = this.project.dispatch({
      type: 'edge.add',
      payload: defined({ fromPort, toPort, connectionType: type, method, props, label, id }),
    })
    return new EdgeHandle(this.project, edgeId, { readOnly: this.#readOnly })
  }

  /**
   * Extract as system (spec §6): moves the nodes into a new child system and returns it,
   * entered through its new composite node.
   * @param {Iterable<NodeHandle|string>} nodes
   * @param {{ name?: string }} [options]
   * @example const orders = root.extract([svc.id, db.id], { name: 'Orders System' })
   */
  extract(nodes, { name } = {}) {
    this.#writable()
    const nodeIds = [...nodes].map(n => resolveNodeId(this, n))
    const { systemId, nodeId } = this.project.dispatch({
      type: 'system.extract',
      payload: defined({ systemId: this.id, nodeIds, name }),
    })
    return new SystemHandle(this.project, systemId, { via: nodeId })
  }

  /**
   * Inline system: dissolves a composite back into this system. Returns the nodes it brought in.
   * @param {NodeHandle|string} node
   * @example root.inline('Orders System')
   */
  inline(node) {
    this.#writable()
    const ids = this.project.dispatch({
      type: 'system.inline',
      payload: { nodeId: resolveNodeId(this, node) },
    })
    return Collection.from(ids.map(id => this.#node(id)))
  }

  /**
   * Pastes a clip (from strata.copy) into this system as one undo step. Nodes that cannot be
   * pasted (e.g. a composite whose system is gone, or one that would contain itself) are
   * skipped and listed.
   * @param {import('./clipboard.js').Clip} clip
   * @param {{ at?: { x: number, y: number } }} [options] where the clip's top-left lands
   * @returns {Collection & { skipped: { name: string, reason: string }[] }}
   * @example root.paste(strata.copy([svc]), { at: { x: 400, y: 100 } })
   */
  paste(clip, options) {
    this.#writable()
    const { nodeIds, skipped } = pasteClip(this, clip, options)
    const out = /** @type {any} */ (Collection.from(nodeIds.map(id => this.#node(id))))
    out.skipped = skipped
    return out
  }

  /**
   * Publishes an internal port as a boundary port of this system.
   * @param {PortHandle|string} port port handle, id or 'Node.port'
   * @param {{ name?: string, direction?: 'in'|'out'|'both' }} [options]
   * @example orders.expose('Orders.in', { name: 'api' })
   */
  expose(port, { name, direction } = {}) {
    this.#writable()
    const portId = resolvePortId(this, port)
    const entity = this[CORE].require('port', portId)
    const taken = new Set(this[CORE].boundaryPortsOf(this.id).map(bp => bp.name))
    let finalName = name
    if (!finalName) {
      finalName = entity.name
      for (let i = 2; taken.has(finalName); i++) finalName = `${entity.name}${i}`
    }
    const id = this.project.dispatch({
      type: 'boundary.add',
      payload: {
        systemId: this.id,
        name: finalName,
        direction: direction ?? entity.direction,
        internalPortId: portId,
      },
    })
    return new BoundaryPortHandle(this.project, id, { readOnly: this.#readOnly })
  }

  /**
   * A node of this system by id or name.
   * @param {string} idOrName
   * @example root.node('Orders')
   */
  node(idOrName) {
    return this.#node(resolveNodeId(this, idOrName))
  }

  /**
   * Nodes of this system (`{ deep: true }` includes every level below).
   * @param {import('../../core/src/core.js').NodeFilter | ((n: NodeHandle) => boolean)} [filter]
   * @example root.nodes({ deep: true }).toTable()
   */
  nodes(filter = {}) {
    if (typeof filter === 'function') return Collection.from(this.nodes().filter(filter))
    return Collection.from(
      this[CORE].nodes({ ...filter, systemId: this.id }).map(n => this.#node(n.id))
    )
  }

  /**
   * Edges of this system.
   * @example root.edges().toTable()
   */
  edges() {
    return Collection.from(
      this[CORE].edgesOf(this.id).map(
        e => new EdgeHandle(this.project, e.id, { readOnly: this.#readOnly })
      )
    )
  }

  /**
   * Boundary ports: the system's interface when used as a component.
   * @example orders.ports().map(bp => bp.name)
   */
  ports() {
    return Collection.from(
      this[CORE].boundaryPortsOf(this.id).map(
        bp => new BoundaryPortHandle(this.project, bp.id, { readOnly: this.#readOnly })
      )
    )
  }

  /**
   * A boundary port by name or id.
   * @param {string} name
   * @example orders.port('in').bind('health', 'Orders')
   */
  port(name) {
    const bp = this[CORE].boundaryPortsOf(this.id).find(p => p.name === name || p.id === name)
    if (!bp)
      fail(
        'NOT_FOUND',
        `'${this.name}' has no boundary port '${name}' (has: ${
          this[CORE].boundaryPortsOf(this.id)
            .map(p => p.name)
            .join(', ') || 'none'
        })`
      )
    return new BoundaryPortHandle(this.project, bp.id, { readOnly: this.#readOnly })
  }

  /**
   * Views of this system.
   * @example root.views()
   */
  views() {
    return Collection.from(this[CORE].viewsOf(this.id))
  }

  /**
   * Composite nodes that place this system.
   * @example auth.parents().map(n => n.name)
   */
  parents() {
    return Collection.from(
      this[CORE].referencingNodes(this.id).map(n => new NodeHandle(this.project, n.id))
    )
  }

  /**
   * Systems placed directly inside this one.
   * @example root.children().map(s => s.name)
   */
  children() {
    return Collection.from(
      this[CORE].nodesOf(this.id)
        .filter(n => nodeKind(n) === 'composite')
        .map(n => this.#node(n.id).child)
    )
  }

  /**
   * Derived value of a property or metric (spec §6 data roll-up).
   * @param {string} key e.g. 'latency.p99', 'monthlyCost'
   * @param {import('../../core/src/rollup.js').RollupOptions & { detail?: boolean }} [options]
   * @example orders.rollup('latency.p99')
   */
  rollup(key, { detail = false, ...options } = {}) {
    const result = this[CORE].rollup(this.id, key, options)
    return detail ? result : result.value
  }

  /**
   * Declared contract checked against derived values.
   * @example console.table(orders.contracts())
   */
  contracts() {
    return Collection.from(this[CORE].checkContracts(this.id))
  }

  /**
   * Problems in this system and every system below it.
   * @example console.table(root.problems())
   */
  problems() {
    const ids = new Set(this[CORE].subtreeSystemIds(this.id))
    return Collection.from(this[CORE].problems().filter(p => p.systemId && ids.has(p.systemId)))
  }

  /**
   * Updates system fields.
   * @param {{ name?: string, levelTag?: string|null, description?: string, contract?: object, rollups?: object, tags?: string[] }} changes
   * @example orders.set({ levelTag: 'container', tags: ['core'] })
   */
  set(changes) {
    this.#writable()
    this.project.dispatch({ type: 'system.update', payload: { id: this.id, changes } })
    return this
  }

  /**
   * Renames the system.
   * @param {string} name
   * @example orders.rename('Orders')
   */
  rename(name) {
    return this.set({ name })
  }

  /**
   * Drill down: makes this the current system (the UI follows if attached).
   * @example orders.enter()
   */
  enter() {
    this.project.nav.enter(this)
    return this
  }

  /**
   * Deletes a library system that is not placed anywhere.
   * @example p.system('Auth').delete()
   */
  delete() {
    this.#writable()
    this.project.dispatch({ type: 'system.delete', payload: { id: this.id } })
  }

  /**
   * Text tree of the system (see also strata.print). @param {{ depth?: number }} [options]
   * @example orders.format({ depth: 1 })
   */
  format(options) {
    return this.project.strata.format(this, options)
  }

  /**
   * Rows describing the nodes, for console.table.
   * @example console.table(root.toTable())
   */
  toTable() {
    return this.nodes().toTable()
  }

  /**
   * A row describing the system, for console.table.
   * @example console.table([orders.toRow()])
   */
  toRow() {
    const e = this.entity
    return {
      id: e.id,
      name: e.name,
      level: e.levelTag,
      nodes: this[CORE].nodesOf(e.id).length,
      library: this.isLibrary,
      readOnly: this.#readOnly,
    }
  }

  /**
   * A short label such as System<Orders>.
   * @example String(orders)
   */
  toString() {
    const e = this[CORE].get('system', this.id)
    return e
      ? `System<${e.name}${this.#readOnly ? ' (read-only)' : ''}>`
      : `System<deleted ${this.id}>`
  }
}

// -------------------------------------------------------------------------------------------
// Nodes
// -------------------------------------------------------------------------------------------

export class NodeHandle extends Handle {
  #readOnly

  /** @param {ProjectHandle} project @param {string} id @param {{ readOnly?: boolean }} [options] */
  constructor(project, id, { readOnly = false } = {}) {
    super(project, id)
    this.#readOnly = readOnly
  }

  get entity() {
    return this[CORE].require('node', this.id)
  }
  get name() {
    return this.entity.name
  }
  get kind() {
    return nodeKind(this.entity)
  }
  get isComposite() {
    return nodeKind(this.entity) === 'composite'
  }
  /** Pinned component type, e.g. 'acme.message-queue@1.2.0' (null for composites). */
  get type() {
    return this.entity.typeRef
  }
  get status() {
    return this.entity.status
  }
  get owner() {
    return this.entity.owner
  }
  get tags() {
    return this.entity.tags
  }
  get description() {
    return this.entity.description
  }
  get readOnly() {
    return this.#readOnly
  }
  /** Effective manifest with inheritance applied, or null for composites and placeholders. */
  get manifest() {
    return this[CORE].manifestOf(this.id)
  }
  /** Effective property values (defaults + overrides), frozen. */
  get props() {
    return Object.freeze(this[CORE].effectiveProps(this.id))
  }

  /**
   * Every property value with its source: 'default' or 'override'.
   * @example svc.explain()
   */
  explain() {
    return this[CORE].explainProps(this.id)
  }

  /** The system this node is in. */
  get system() {
    return new SystemHandle(this.project, this.entity.systemId, { readOnly: this.#readOnly })
  }

  /** For a composite: the system it contains, reached through this node. */
  get child() {
    const e = this.entity
    if (nodeKind(e) !== 'composite') return null
    return new SystemHandle(this.project, e.innerSystemRef, {
      via: e.id,
      readOnly: this.#readOnly || e.placement === 'reference',
    })
  }

  /** 'reference' or 'value' for composites; null otherwise. */
  get placement() {
    return this.entity.placement
  }

  #writable() {
    if (this.#readOnly)
      fail(
        'E_SYSTEM_READONLY',
        `'${this.name}' is inside a system placed by reference and is read-only here`
      )
  }

  /**
   * Sets property values (validated against the component manifest).
   * @param {Record<string, unknown>} props
   * @example svc.set({ concurrency: 64 })
   */
  set(props) {
    this.#writable()
    this.project.dispatch({ type: 'node.setProps', payload: { id: this.id, props } })
    return this
  }

  /**
   * Resets properties to their defaults. @param {...string} keys
   * @example svc.unset('concurrency')
   */
  unset(...keys) {
    this.#writable()
    this.project.dispatch({ type: 'node.setProps', payload: { id: this.id, unset: keys } })
    return this
  }

  /**
   * Changes the node's fields.
   * @param {{ name?: string, description?: string, tags?: string[], owner?: string|null, status?: string }} changes
   * @example svc.update({ owner: 'payments', tags: ['core'] })
   */
  update(changes) {
    this.#writable()
    this.project.dispatch({ type: 'node.update', payload: { id: this.id, changes } })
    return this
  }

  /**
   * Renames the node.
   * @param {string} name
   * @example svc.rename('Orders API')
   */
  rename(name) {
    return this.update({ name })
  }

  /**
   * The component's public and private methods (spec §6), public ones with the ports that
   * expose them. A System component's public methods are those its boundary ports bind.
   * @returns {Collection & MethodInfo[]}
   * @example db.methods().filter(m => m.visibility === 'public')
   */
  methods() {
    const core = this[CORE]
    const ports = core.portsOf(this.id)
    const exposing = (/** @type {string} */ name) =>
      ports.filter(p => core.exposedMethods(p).includes(name)).map(p => p.name)
    /** @type {{ public?: Record<string, object>, private?: Record<string, object> }} */
    const declared =
      this.entity.typeRef === SYSTEM_TYPE_REF
        ? {
            public: Object.fromEntries(
              [...new Set(ports.flatMap(p => core.exposedMethods(p)))].map(n => [n, {}])
            ),
          }
        : (this.manifest?.methods ?? {})
    return /** @type {Collection & MethodInfo[]} */ (
      Collection.from([
        ...Object.entries(declared.public ?? {}).map(([name, spec]) => ({
          name,
          visibility: /** @type {const} */ ('public'),
          ports: exposing(name),
          ...spec,
        })),
        ...Object.entries(declared.private ?? {}).map(([name, spec]) => ({
          name,
          visibility: /** @type {const} */ ('private'),
          ports: [],
          ...spec,
        })),
      ])
    )
  }

  /**
   * The component's typed initial state (spec §6): each declared state field's initial value.
   * @example svc.state() // { backlog: [], circuits: {} }
   */
  state() {
    /** @type {Record<string, { initial?: unknown }>} */
    const declared = /** @type {any} */ (this.manifest)?.state ?? {}
    return Object.fromEntries(
      Object.entries(declared).map(([key, schema]) => [
        key,
        structuredClone(schema.initial ?? null),
      ])
    )
  }

  /**
   * Gives the component an inner system of its own (spec §7): its ports become the inner
   * system's boundary ports, and it keeps its type and properties as its black-box model.
   * @returns {SystemHandle}
   * @example const inner = svc.openAsSystem(); inner.enter()
   */
  openAsSystem() {
    this.#writable()
    const id = this.project.dispatch({ type: 'component.openAsSystem', payload: { id: this.id } })
    return new SystemHandle(this.project, id, { via: this.id })
  }

  /**
   * Removes the inner system a component was opened with, leaving it a black box.
   * @example svc.removeInnerSystem()
   */
  removeInnerSystem() {
    this.#writable()
    this.project.dispatch({ type: 'component.removeInnerSystem', payload: { id: this.id } })
    return this
  }

  /**
   * Follows a public method's bindings down to the component that implements it (spec §7).
   * @param {string} method
   * @param {{ port?: string }} [options]  the exposing port, when there are several
   * @returns {{ node: NodeHandle, method: string, path: { node: NodeHandle, method: string }[] }}
   * @example payments.resolve('refund').node.name // 'Ledger API'
   */
  resolve(method, { port } = {}) {
    const r = this[CORE].resolveBinding(this.id, method, defined({ port }))
    const node = (/** @type {string} */ id) => new NodeHandle(this.project, id)
    return {
      node: node(r.nodeId),
      method: r.method,
      path: r.path.map(hop => ({ node: node(hop.nodeId), method: hop.method })),
    }
  }

  /**
   * A port by name or id.
   * @param {string} name
   * @example svc.port('db')
   */
  port(name) {
    const ports = this[CORE].portsOf(this.id)
    const port = ports.find(p => p.name === name) ?? ports.find(p => p.id === name)
    if (!port)
      fail(
        'NOT_FOUND',
        `'${this.name}' has no port '${name}' (has: ${ports.map(p => p.name).join(', ') || 'none'})`
      )
    return new PortHandle(this.project, port.id, { readOnly: this.#readOnly })
  }

  /**
   * The node's ports.
   * @example svc.ports().toTable()
   */
  ports() {
    return Collection.from(
      this[CORE].portsOf(this.id).map(
        p => new PortHandle(this.project, p.id, { readOnly: this.#readOnly })
      )
    )
  }

  /**
   * Adds an extra port beyond those the manifest declares.
   * @param {string} name
   * @param {{ direction: 'in'|'out'|'both', accepts?: string[] }} options
   * @example svc.addPort('metrics', { direction: 'out' })
   */
  addPort(name, { direction, accepts } = /** @type {any} */ ({})) {
    this.#writable()
    const id = this.project.dispatch({
      type: 'port.add',
      payload: defined({ nodeId: this.id, name, direction, accepts }),
    })
    return new PortHandle(this.project, id, { readOnly: this.#readOnly })
  }

  /**
   * Edges attached to any of this node's ports.
   * @example svc.edges().toTable()
   */
  edges() {
    const seen = new Map()
    for (const port of this[CORE].portsOf(this.id)) {
      for (const edge of this[CORE].edgesAtPort(port.id)) seen.set(edge.id, edge)
    }
    return Collection.from(
      [...seen.keys()]
        .sort()
        .map(id => new EdgeHandle(this.project, id, { readOnly: this.#readOnly }))
    )
  }

  /**
   * Connects one of this node's ports to another node or port (see SystemHandle.connect).
   * @param {PortHandle|NodeHandle|string} to
   * @param {{ type?: string, props?: object, label?: string }} [options]
   * @example gw.connect(svc, { type: 'http' })
   */
  connect(to, options) {
    return this.system.connect(this, to, options)
  }

  /** Position in the system's first view, or null. */
  get position() {
    const [view] = this[CORE].viewsOf(this.entity.systemId)
    const entry = view?.layout[this.id]
    return entry && typeof entry.x === 'number' ? { x: entry.x, y: entry.y } : null
  }

  /**
   * Moves the node in a view (default: the system's first view).
   * @param {number} x
   * @param {number} y
   * @param {{ view?: string }} [options] view id
   * @example svc.moveTo(240, 120)
   */
  moveTo(x, y, { view } = {}) {
    this.#writable()
    const viewId = view ?? this[CORE].viewsOf(this.entity.systemId)[0].id
    this.project.dispatch({
      type: 'view.layout',
      payload: { viewId, set: { [this.id]: { x, y } } },
    })
    return this
  }

  /**
   * Views in which the node is visible.
   * @example svc.views()
   */
  views() {
    return Collection.from(this[CORE].viewsContaining(this.id))
  }

  /**
   * Composite only: enter the contained system.
   * @example payments.enter()
   */
  enter() {
    const child = this.child
    if (!child) fail('INVALID', `'${this.name}' is not a composite; there is nothing to enter`)
    return child.enter()
  }

  /**
   * Composite only: derived value of its system. @param {string} key @param {object} [options]
   * @example payments.rollup('monthlyCost')
   */
  rollup(key, options) {
    const child = this.child
    if (!child) fail('INVALID', `'${this.name}' is atomic; read its properties with .props`)
    return child.rollup(key, options)
  }

  /**
   * Composite by reference only: switch to an editable copy. Returns the copy.
   * @example auth.detach()
   */
  detach() {
    this.#writable()
    this.project.dispatch({ type: 'node.detach', payload: { id: this.id } })
    return this.child
  }

  /**
   * Composite only: dissolve into the parent system.
   * @example payments.inline()
   */
  inline() {
    return this.system.inline(this)
  }

  /**
   * Removes the node from the model and every view.
   * @example svc.remove()
   */
  remove() {
    this.#writable()
    this.project.dispatch({ type: 'node.remove', payload: { id: this.id } })
  }

  /**
   * Makes this node the selection.
   * @example svc.select()
   */
  select() {
    this.project.strata.select(this)
    return this
  }

  /**
   * A row describing the node, for console.table.
   * @example console.table([svc.toRow()])
   */
  toRow() {
    const e = this.entity
    return {
      id: e.id,
      name: e.name,
      type:
        nodeKind(e) === 'composite'
          ? `▣ ${this[CORE].get('system', e.innerSystemRef)?.name ?? '?'} (${e.placement})`
          : e.typeRef,
      status: e.status,
      owner: e.owner ?? '',
    }
  }

  /**
   * A short label such as Node<Orders>.
   * @example String(svc)
   */
  toString() {
    const e = this[CORE].get('node', this.id)
    if (!e) return `Node<deleted ${this.id}>`
    return `Node<${e.name} ${nodeKind(e) === 'composite' ? `▣ ${e.placement}` : e.typeRef}>`
  }
}

// -------------------------------------------------------------------------------------------
// Ports, edges and boundary ports
// -------------------------------------------------------------------------------------------

export class PortHandle extends Handle {
  #readOnly

  /** @param {ProjectHandle} project @param {string} id @param {{ readOnly?: boolean }} [options] */
  constructor(project, id, { readOnly = false } = {}) {
    super(project, id)
    this.#readOnly = readOnly
  }

  get entity() {
    return this[CORE].require('port', this.id)
  }
  get name() {
    return this.entity.name
  }
  get direction() {
    return this.entity.direction
  }
  /** Connection types accepted (resolved through boundary ports); empty means any. */
  get accepts() {
    return this[CORE].acceptsOf(this.id)
  }
  /** The public methods an edge into this port may call (spec §6); a boundary port's are its bound ones. */
  get exposes() {
    return this[CORE].exposedMethods(this.id)
  }
  /** False for extra ports added to a node. */
  get declared() {
    return this.entity.declared
  }
  get node() {
    return new NodeHandle(this.project, this.entity.nodeId, { readOnly: this.#readOnly })
  }
  get connected() {
    return this[CORE].edgesAtPort(this.id).length > 0
  }

  /**
   * Edges attached to this port.
   * @example svc.port('db').edges()
   */
  edges() {
    return Collection.from(
      this[CORE].edgesAtPort(this.id).map(
        e => new EdgeHandle(this.project, e.id, { readOnly: this.#readOnly })
      )
    )
  }

  /**
   * The atomic port that ultimately handles this one, following boundary ports down.
   * @example payments.port('in').resolve().node.name
   */
  resolve() {
    const { port } = this[CORE].resolvePort(this.id)
    return new PortHandle(this.project, port.id)
  }

  /**
   * Connects this port to another port or node.
   * @param {PortHandle|NodeHandle|string} to
   * @param {{ type?: string, props?: object, label?: string }} [options]
   * @example svc.port('db').connect(db, { type: 'db-protocol' })
   */
  connect(to, options) {
    return this.node.system.connect(this, to, options)
  }

  /**
   * A row describing the port, for console.table.
   * @example console.table(svc.ports())
   */
  toRow() {
    const e = this.entity
    return {
      id: e.id,
      node: this[CORE].get('node', e.nodeId)?.name,
      name: e.name,
      direction: e.direction,
      accepts: this.accepts.join(', ') || 'any',
      connected: this.connected,
    }
  }

  /**
   * A short label such as Port<Orders.db>.
   * @example String(svc.port('db'))
   */
  toString() {
    const e = this[CORE].get('port', this.id)
    return e
      ? `Port<${this[CORE].get('node', e.nodeId)?.name}.${e.name}>`
      : `Port<deleted ${this.id}>`
  }
}

export class EdgeHandle extends Handle {
  #readOnly

  /** @param {ProjectHandle} project @param {string} id @param {{ readOnly?: boolean }} [options] */
  constructor(project, id, { readOnly = false } = {}) {
    super(project, id)
    this.#readOnly = readOnly
  }

  get entity() {
    return this[CORE].require('edge', this.id)
  }
  get from() {
    return new PortHandle(this.project, this.entity.fromPort, { readOnly: this.#readOnly })
  }
  get to() {
    return new PortHandle(this.project, this.entity.toPort, { readOnly: this.#readOnly })
  }
  /** Connection type, e.g. 'http'. */
  get type() {
    return this.entity.connectionType
  }
  get label() {
    return this.entity.label
  }
  /** The public method the edge calls, or null when it calls any the target port exposes. */
  get method() {
    return this.entity.method ?? null
  }
  /** The connection type's manifest (inheritance applied), or null when it is not installed. */
  get manifest() {
    return this[CORE].connectionTypeOf(this.id)
  }
  /** Property values after the connection type's defaults. */
  get props() {
    return Object.freeze(this[CORE].effectiveProps(this.id))
  }
  /**
   * Every property value with its source ('default' or 'override').
   * @example edge.explain()
   */
  explain() {
    return this[CORE].explainProps(this.id)
  }

  #writable() {
    if (this.#readOnly)
      fail(
        'E_SYSTEM_READONLY',
        'This edge is inside a system placed by reference and is read-only here'
      )
  }

  /**
   * Sets property values (validated against the connection type).
   * @param {Record<string, unknown>} props
   * @example edge.set({ retries: 2 })
   */
  set(props) {
    this.#writable()
    this.project.dispatch({ type: 'edge.setProps', payload: { id: this.id, props } })
    return this
  }

  /**
   * Resets properties to the connection type's defaults.
   * @param {...string} keys
   * @example edge.unset('retries')
   */
  unset(...keys) {
    this.#writable()
    this.project.dispatch({ type: 'edge.setProps', payload: { id: this.id, unset: keys } })
    return this
  }

  /**
   * Changes the label, the connection type or the method the edge calls.
   * @param {{ label?: string, type?: string|null, method?: string|null }} changes
   *   method: the public method the edge calls (null: any the target port exposes)
   * @example edge.update({ method: 'query' })
   */
  update({ label, type, method }) {
    this.#writable()
    this.project.dispatch({
      type: 'edge.update',
      payload: { id: this.id, changes: defined({ label, connectionType: type, method }) },
    })
    return this
  }

  /**
   * Moves either end of the edge to another port.
   * @param {{ from?: PortHandle|string, to?: PortHandle|string }} ends
   * @example edge.rewire({ to: 'Replica.in' })
   */
  rewire({ from, to }) {
    this.#writable()
    const system = new SystemHandle(this.project, this.entity.systemId)
    this.project.dispatch({
      type: 'edge.rewire',
      payload: defined({
        id: this.id,
        fromPort: from && resolvePortId(system, from),
        toPort: to && resolvePortId(system, to),
      }),
    })
    return this
  }

  /**
   * Removes the edge.
   * @example edge.remove()
   */
  remove() {
    this.#writable()
    this.project.dispatch({ type: 'edge.remove', payload: { id: this.id } })
  }

  /**
   * Makes this edge the selection.
   * @example edge.select()
   */
  select() {
    this.project.strata.select(this)
    return this
  }

  /**
   * A row describing the edge, for console.table.
   * @example console.table(root.edges())
   */
  toRow() {
    const e = this.entity
    return {
      id: e.id,
      from: portLabel(this[CORE], e.fromPort),
      to: portLabel(this[CORE], e.toPort),
      type: e.connectionType ?? '',
      method: e.method ?? '',
      label: e.label,
    }
  }

  /**
   * A short label such as Edge<Orders.db → Orders DB.in>.
   * @example String(edge)
   */
  toString() {
    const e = this[CORE].get('edge', this.id)
    return e
      ? `Edge<${portLabel(this[CORE], e.fromPort)} → ${portLabel(this[CORE], e.toPort)}>`
      : `Edge<deleted ${this.id}>`
  }
}

export class BoundaryPortHandle extends Handle {
  #readOnly

  /** @param {ProjectHandle} project @param {string} id @param {{ readOnly?: boolean }} [options] */
  constructor(project, id, { readOnly = false } = {}) {
    super(project, id)
    this.#readOnly = readOnly
  }

  get entity() {
    return this[CORE].require('boundaryPort', this.id)
  }
  get name() {
    return this.entity.name
  }
  get direction() {
    return this.entity.direction
  }
  get system() {
    return new SystemHandle(this.project, this.entity.systemId, { readOnly: this.#readOnly })
  }
  /** The internal port it maps to, or null when unmapped. */
  get internal() {
    const id = this.entity.internalPortId
    return id ? new PortHandle(this.project, id, { readOnly: this.#readOnly }) : null
  }

  #writable() {
    if (this.#readOnly)
      fail(
        'E_SYSTEM_READONLY',
        'This boundary port belongs to a system placed by reference and is read-only here'
      )
  }

  /**
   * Maps the boundary port to another internal port (null unmaps it). @param {PortHandle|string|null} port
   * @example inner.port('in').map('Rules engine.in')
   */
  map(port) {
    this.#writable()
    const internalPortId = port === null ? null : resolvePortId(this.system, port)
    this.project.dispatch({
      type: 'boundary.update',
      payload: { id: this.id, changes: { internalPortId } },
    })
    return this
  }

  /** The methods bound on this port, as method → { node, method } (spec §7). */
  get bindings() {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(this.entity.bindings ?? {}).map(([method, target]) => [
          method,
          {
            node: new NodeHandle(this.project, target.nodeId, { readOnly: this.#readOnly }),
            method: target.method,
          },
        ])
      )
    )
  }

  /**
   * Binds a public method of the system to a method of a component reachable from this port.
   * @param {string} method @param {NodeHandle|string} node @param {string} [target] defaults to `method`
   * @example inner.port('in').bind('refund', 'Ledger', 'reverse')
   */
  bind(method, node, target = method) {
    this.#writable()
    this.project.dispatch({
      type: 'boundary.bind',
      payload: {
        boundaryPortId: this.id,
        method,
        nodeId: resolveNodeId(this.system, node),
        target,
      },
    })
    return this
  }

  /**
   * Removes a method's binding from this port.
   * @param {string} method
   * @example inner.port('in').unbind('refund')
   */
  unbind(method) {
    this.#writable()
    this.project.dispatch({
      type: 'boundary.unbind',
      payload: { boundaryPortId: this.id, method },
    })
    return this
  }

  /**
   * Renames the boundary port.
   * @param {string} name
   * @example bp.rename('api')
   */
  rename(name) {
    this.#writable()
    this.project.dispatch({ type: 'boundary.update', payload: { id: this.id, changes: { name } } })
    return this
  }

  /**
   * Removes the boundary port.
   * @example bp.remove()
   */
  remove() {
    this.#writable()
    this.project.dispatch({ type: 'boundary.remove', payload: { id: this.id } })
  }

  /**
   * A row describing the boundary port, for console.table.
   * @example console.table(orders.ports())
   */
  toRow() {
    const e = this.entity
    return {
      id: e.id,
      name: e.name,
      direction: e.direction,
      maps: e.internalPortId ? portLabel(this[CORE], e.internalPortId) : '(unmapped)',
    }
  }

  /**
   * A short label such as BoundaryPort<in in>.
   * @example String(bp)
   */
  toString() {
    const e = this[CORE].get('boundaryPort', this.id)
    return e ? `BoundaryPort<${e.name} ${e.direction}>` : `BoundaryPort<deleted ${this.id}>`
  }
}

// -------------------------------------------------------------------------------------------
// Resolution helpers
// -------------------------------------------------------------------------------------------

/**
 * @param {Core} core @param {string} portId
 * @internal
 */
export function portLabel(core, portId) {
  const port = core.get('port', portId)
  if (!port) return `?${portId}`
  return `${core.get('node', port.nodeId)?.name ?? '?'}.${port.name}`
}

/**
 * @param {ProjectHandle} project
 * @param {SystemHandle|string} system handle, id or name
 * @internal
 */
export function resolveSystemId(project, system) {
  if (system instanceof SystemHandle) return system.id
  const core = coreOf(project)
  if (typeof system !== 'string' || !system) fail('INVALID', 'Expected a system handle, id or name')
  if (core.get('system', system)) return system
  const matches = core.all('system').filter(s => s.name === system)
  const loose = matches.length
    ? matches
    : core.all('system').filter(s => s.name.toLowerCase() === system.toLowerCase())
  if (loose.length === 1) return loose[0].id
  if (loose.length > 1)
    fail(
      'AMBIGUOUS',
      `Several systems are named '${system}'; use an id (${loose.map(s => s.id).join(', ')})`
    )
  return fail('NOT_FOUND', `No system '${system}'`)
}

/**
 * @param {SystemHandle} system scope for name lookups
 * @param {NodeHandle|string} node handle, id or name
 * @internal
 */
export function resolveNodeId(system, node) {
  if (node instanceof NodeHandle) return node.id
  const core = coreOf(system.project)
  if (typeof node !== 'string' || !node) fail('INVALID', 'Expected a node handle, id or name')
  if (core.get('node', node)) return node
  const inSystem = core.nodesOf(system.id)
  const matches = inSystem.filter(n => n.name === node)
  const loose = matches.length
    ? matches
    : inSystem.filter(n => n.name.toLowerCase() === node.toLowerCase())
  if (loose.length === 1) return loose[0].id
  if (loose.length > 1)
    fail(
      'AMBIGUOUS',
      `Several nodes in '${system.name}' are named '${node}'; use an id (${loose.map(n => n.id).join(', ')})`
    )
  return fail(
    'NOT_FOUND',
    `No node '${node}' in '${system.name}' (has: ${inSystem.map(n => n.name).join(', ') || 'none'})`
  )
}

/**
 * @param {SystemHandle} system scope for 'Node.port' lookups
 * @param {PortHandle|string} port handle, id or 'Node.port'
 * @internal
 */
export function resolvePortId(system, port) {
  if (port instanceof PortHandle) return port.id
  const core = coreOf(system.project)
  if (typeof port !== 'string' || !port)
    fail('INVALID', 'Expected a port handle, port id or "Node.port"')
  if (core.get('port', port)) return port
  const dot = port.lastIndexOf('.')
  if (dot > 0) {
    const nodeId = resolveNodeId(system, port.slice(0, dot))
    return new NodeHandle(system.project, nodeId).port(port.slice(dot + 1)).id
  }
  return fail('NOT_FOUND', `No port '${port}'; use a port handle, an id or "Node.port"`)
}

/**
 * Resolves both ends of a connection. A NodeHandle (or node name) end picks the port that
 * fits: right direction, and a shared connection type if both sides declare types.
 * @param {SystemHandle} system
 * @param {unknown} from
 * @param {unknown} to
 * @param {string|undefined} type
 * @returns {[string, string]}
 */
function pickPorts(system, from, to, type) {
  const core = coreOf(system.project)
  // An end is a port handle, a node handle, a port id, a node id, a node name or 'Node.port'.
  const candidates = (end, role) => {
    if (end instanceof PortHandle) return [end.id]
    let nodeId = end instanceof NodeHandle ? end.id : null
    if (!nodeId) {
      if (typeof end !== 'string' || !end)
        fail('INVALID', `Cannot connect ${String(end)}; expected a port, a node or "Node.port"`)
      if (core.get('port', end)) return [end]
      if (
        core.get('node', end) ||
        core.nodesOf(system.id).some(n => n.name === end) ||
        end.lastIndexOf('.') <= 0
      ) {
        nodeId = resolveNodeId(system, end)
      } else {
        return [resolvePortId(system, end)]
      }
    }
    return core
      .portsOf(nodeId)
      .filter(p => p.direction === 'both' || p.direction === (role === 'from' ? 'out' : 'in'))
      .map(p => p.id)
  }
  const froms = candidates(from, 'from')
  const tos = candidates(to, 'to')
  let best = null
  let bestScore = -1
  for (const f of froms) {
    for (const t of tos) {
      const a = core.acceptsOf(f)
      const b = core.acceptsOf(t)
      if (type && ((a.length && !a.includes(type)) || (b.length && !b.includes(type)))) continue
      const shared = a.length && b.length ? a.filter(x => b.includes(x)) : null
      if (shared && shared.length === 0) continue
      const score = shared ? 2 : 1
      if (score > bestScore) {
        best = [f, t]
        bestScore = score
      }
    }
  }
  if (best) return /** @type {[string, string]} */ (best)
  if (froms.length === 1 && tos.length === 1) return [froms[0], tos[0]] // let the core explain why it fails
  const describe = ids => ids.map(id => portLabel(core, id)).join(', ') || 'none'
  return fail(
    'INVALID',
    `No compatible ports to connect${type ? ` with type '${type}'` : ''} (outputs: ${describe(froms)}; inputs: ${describe(tos)})`
  )
}
