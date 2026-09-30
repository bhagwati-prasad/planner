/**
 * The headless core (spec §4): one project's model plus the command bus that changes it.
 * It has no DOM dependency and runs unchanged on the main thread, in a worker and in Node.
 * Reads return frozen plain objects; changes arrive as events.
 */
import { Emitter } from './emitter.js'
import { fail } from './errors.js'
import { err } from './result.js'
import { Store } from './store.js'
import { CommandBus } from './bus.js'
import { createRegistry } from './registry.js'
import { createUlidFactory } from './ulid.js'
import { registerCoreCommands } from './commands/index.js'
import { migrateSnapshot } from './migrations/index.js'
import { checkContracts } from './rollup.js'
import { findProblems } from './validate.js'
import { planExtract, planInline } from './planners.js'
import { RollupCache } from './rollup-cache.js'
import { canonicalJson } from './plain.js'
import { sha256, toHex } from './sha256.js'
import {
  acceptsOf,
  boundaryPortsOf,
  childSystemIds,
  connectionTypeOf,
  containsSystem,
  edgesAtPort,
  edgesOf,
  effectiveProps,
  explainProps,
  exposedMethods,
  manifestOf,
  nodesOf,
  pathsTo,
  portsOf,
  projectOf,
  referencingNodes,
  resolveBinding,
  resolvePort,
  resolveSystem,
  nodeKind,
  subtreeSystemIds,
  walk,
  viewsOf,
  wouldCycle,
} from './model.js'

/**
 * @typedef {object} CoreOptions
 * @property {import('./registry.js').Registry} [registry]  component types (default: built-in base types)
 * @property {string} [actorId]   author recorded on every operation and entity
 * @property {import('./types.js').Clock} clock  the clock adapter (eng §6): the real one, or a fake in tests
 * @property {import('./types.js').RandomBytes} [random]  random bytes for ULIDs (default: Web Crypto)
 * @property {Record<string, any>} [snapshot]  model to load, from `snapshot()`; an older schema
 *   version is migrated first
 *
 * @typedef {object} NodeFilter
 * @property {string} [systemId]  limit to one system (default: all systems)
 * @property {boolean} [deep]     with systemId: include every system below it
 * @property {'atomic'|'composite'} [kind]
 * @property {string} [type]      component id, e.g. 'base:queue'
 * @property {string} [extends]   component id the type inherits from
 * @property {string} [tag]
 * @property {string} [status]
 * @property {string} [owner]
 * @property {string} [name]
 */

export class Core {
  #store
  #bus
  #emitter = new Emitter()
  #registry
  /** @type {() => string} */
  #newId
  /** @type {RollupCache} */
  #rollups

  /** @param {CoreOptions} options */
  constructor(
    {
      registry = createRegistry(),
      actorId = 'local',
      clock,
      random,
      snapshot,
    } = /** @type {any} */ ({})
  ) {
    if (typeof clock !== 'function')
      fail(
        'E_ADAPTER_MISSING',
        'createCore needs a clock adapter: () => epoch milliseconds (eng §6)'
      )
    this.#registry = registry
    this.#store = new Store()
    if (snapshot) this.#store.load(migrateSnapshot(snapshot, { registry }))
    this.#newId = createUlidFactory({ now: clock, random })
    this.#bus = new CommandBus({
      store: this.#store,
      emitter: this.#emitter,
      newId: this.#newId,
      clock,
      actorId,
      services: { registry },
    })
    registerCoreCommands(this.#bus)
    this.#rollups = new RollupCache(this.#store, registry)
    this.#emitter.on('change', ({ op }) => this.#rollups.invalidate(op))
  }

  // --- identity and state ------------------------------------------------------------------

  get registry() {
    return this.#registry
  }
  /** Model revision: number of operations applied since the project was created. */
  get rev() {
    return this.#store.rev
  }
  get actorId() {
    return this.#bus.actorId
  }
  set actorId(id) {
    this.#bus.actorId = id
  }
  get project() {
    return projectOf(this.#store)
  }
  get rootSystemId() {
    return this.project?.rootSystemId ?? null
  }

  // --- generic reads -------------------------------------------------------------------------

  /** @param {string} kind @param {string} id */
  get(kind, id) {
    return this.#store.get(kind, id)
  }
  /** @param {string} kind @param {string} id */
  require(kind, id) {
    return this.#store.require(kind, id)
  }
  /** @param {string} kind */
  all(kind) {
    return this.#store.all(kind)
  }
  /** @param {string} kind @param {string} field @param {unknown} value */
  find(kind, field, value) {
    return this.#store.find(kind, field, value)
  }

  /** @param {string} id */ system(id) {
    return this.#store.get('system', id)
  }
  /** @param {string} id */ node(id) {
    return this.#store.get('node', id)
  }
  /** @param {string} id */ port(id) {
    return this.#store.get('port', id)
  }
  /** @param {string} id */ edge(id) {
    return this.#store.get('edge', id)
  }
  /** @param {string} id */ boundaryPort(id) {
    return this.#store.get('boundaryPort', id)
  }
  /** @param {string} id */ view(id) {
    return this.#store.get('view', id)
  }

  // --- structure -----------------------------------------------------------------------------

  /** @param {string} systemId */ nodesOf(systemId) {
    return nodesOf(this.#store, systemId)
  }
  /** @param {string} systemId */ edgesOf(systemId) {
    return edgesOf(this.#store, systemId)
  }
  /** @param {string} nodeId */ portsOf(nodeId) {
    return portsOf(this.#store, nodeId)
  }
  /** @param {string} systemId */ boundaryPortsOf(systemId) {
    return boundaryPortsOf(this.#store, systemId)
  }
  /** @param {string} systemId */ viewsOf(systemId) {
    return viewsOf(this.#store, systemId)
  }
  /** @param {string} portId */ edgesAtPort(portId) {
    return edgesAtPort(this.#store, portId)
  }
  /** Composite nodes that place a system. @param {string} systemId */
  referencingNodes(systemId) {
    return referencingNodes(this.#store, systemId)
  }
  /** @param {string} systemId */ childSystemIds(systemId) {
    return childSystemIds(this.#store, systemId)
  }
  /** @param {string} systemId */ subtreeSystemIds(systemId) {
    return subtreeSystemIds(this.#store, systemId)
  }
  /** @param {string} outer @param {string} inner */ containsSystem(outer, inner) {
    return containsSystem(this.#store, outer, inner)
  }
  /** @param {string} containerId @param {string} childId */ wouldCycle(containerId, childId) {
    return wouldCycle(this.#store, containerId, childId)
  }
  /** @param {string} systemId @param {{ limit?: number }} [options] */ pathsTo(systemId, options) {
    return pathsTo(this.#store, systemId, options)
  }
  /** @param {string} portId */ resolvePort(portId) {
    return resolvePort(this.#store, portId)
  }

  /**
   * Views of the element's system in which it is visible (for the "remove from model"
   * confirmation, spec §5).
   * @param {string} elementId node or edge id
   */
  viewsContaining(elementId) {
    const element = this.#store.get('node', elementId) ?? this.#store.get('edge', elementId)
    if (!element) fail('NOT_FOUND', `No node or edge '${elementId}'`)
    return viewsOf(this.#store, element.systemId).filter(v => !v.hidden.includes(elementId))
  }

  /**
   * Nodes matching a filter, in id order.
   * @param {NodeFilter} [filter]
   */
  nodes(filter = {}) {
    let list
    if (filter.systemId) {
      const ids = filter.deep ? subtreeSystemIds(this.#store, filter.systemId) : [filter.systemId]
      list = ids.flatMap(id => nodesOf(this.#store, id))
    } else {
      list = this.#store.all('node')
    }
    return list.filter(
      n =>
        (filter.kind === undefined || nodeKind(n) === filter.kind) &&
        (filter.type === undefined ||
          n.typeRef === filter.type ||
          n.typeRef?.startsWith(`${filter.type}@`)) &&
        (filter.extends === undefined ||
          (!!n.typeRef && this.#registry.isA(n.typeRef, filter.extends))) &&
        (filter.tag === undefined || n.tags.includes(filter.tag)) &&
        (filter.status === undefined || n.status === filter.status) &&
        (filter.owner === undefined || n.owner === filter.owner) &&
        (filter.name === undefined || n.name === filter.name)
    )
  }

  // --- properties ----------------------------------------------------------------------------

  #nodeArg(nodeOrId) {
    return typeof nodeOrId === 'string' ? this.#store.require('node', nodeOrId) : nodeOrId
  }

  /** A node or an edge, by id or entity. */
  #propsArg(idOrEntity) {
    if (typeof idOrEntity !== 'string') return idOrEntity
    return this.#store.get('node', idOrEntity) ?? this.#store.require('edge', idOrEntity)
  }

  /** @param {string|object} node */ manifestOf(node) {
    return manifestOf(this.#registry, this.#nodeArg(node))
  }
  /** @param {string|object} edge */ connectionTypeOf(edge) {
    return connectionTypeOf(
      this.#registry,
      typeof edge === 'string' ? this.#store.require('edge', edge) : edge
    )
  }
  /** @param {string|object} entity a node or an edge */ effectiveProps(entity) {
    return effectiveProps(this.#registry, this.#propsArg(entity))
  }
  /**
   * The public methods a port exposes (spec §6): those its component's manifest lists, or, on a
   * System component, the methods bound on the boundary port it mirrors.
   * @param {string|{ nodeId: string, name: string, boundaryPortId?: string|null }} port
   */
  exposedMethods(port) {
    const entity = typeof port === 'string' ? this.#store.require('port', port) : port
    return exposedMethods(this.#store, this.#registry, entity)
  }
  /** @param {string|object} entity a node or an edge */ explainProps(entity) {
    return explainProps(this.#registry, this.#propsArg(entity))
  }
  /** @param {string|object} port */
  acceptsOf(port) {
    return acceptsOf(
      this.#store,
      typeof port === 'string' ? this.#store.require('port', port) : port
    )
  }

  // --- derived values and problems -----------------------------------------------------------

  /**
   * The roll-up of `key` over a system (spec §7). Results are memoised per system and frozen: a
   * change inside a system invalidates only its own and its ancestors' roll-ups (eng §9).
   * @param {string} systemId
   * @param {string} key
   * @param {import('./rollup.js').RollupOptions} [options]
   */
  rollup(systemId, key, options) {
    return this.#rollups.get(systemId, key, options)
  }

  /** @param {string} systemId @param {import('./rollup.js').RollupOptions} [options] */
  checkContracts(systemId, options) {
    return checkContracts(this.#store, this.#registry, systemId, options)
  }

  /** @param {{ contracts?: boolean }} [options] */
  problems(options) {
    return findProblems(this.#store, this.#registry, options)
  }

  // --- commands ------------------------------------------------------------------------------

  /**
   * Applies a command. With `at`, the path of composite nodes from the root to where the edit is
   * made (see resolveSystem), an edit inside a system placed by reference fails with
   * E_SYSTEM_READONLY: it is made at the system's source instead (eng §9).
   * @param {{ type: string, payload?: any }} command
   * @param {import('./bus.js').DispatchOptions & { at?: string[] }} [options]
   */
  dispatch(command, { at, ...options } = {}) {
    const via = at && this.#referenceOn(at)
    if (via)
      fail(
        'E_SYSTEM_READONLY',
        `'${this.#store.require('node', via).name}' places its system by reference, so it is read-only here; edit it at its source, or detach the placement for an editable copy`,
        { viaNodeId: via }
      )
    return this.#bus.dispatch(command, options)
  }

  /**
   * Like `dispatch`, but returns `{ ok: false, code, details }` instead of throwing when the
   * command is refused, and `{ ok: true, value }` otherwise.
   * @param {{ type: string, payload?: any }} command
   * @param {import('./bus.js').DispatchOptions & { at?: string[] }} [options]
   */
  tryDispatch(command, { at, ...options } = {}) {
    const via = at && this.#referenceOn(at)
    if (via) return err('E_SYSTEM_READONLY', { viaNodeId: via })
    return this.#bus.tryDispatch(command, options)
  }

  /** The first node on a path that places its system by reference, or null. @param {string[]} path */
  #referenceOn(path) {
    if (!resolveSystem(this.#store, path).readOnly) return null
    return path.find(id => this.#store.get('node', id)?.placement === 'reference') ?? null
  }

  /**
   * The system at the end of a path of composite nodes from the root, its depth, and whether it
   * is read-only there because a placement on the way is by reference.
   * @param {string[]} path
   */
  resolveSystem(path) {
    return resolveSystem(this.#store, path)
  }

  /**
   * The primitive commands `system.extract` would run for this payload, without running them
   * (eng §7): `{ commands, systemId, nodeId, name }`. Running `commands` as a batch extracts.
   * @param {{ systemId: string, nodeIds: string[], name?: string, id?: string, nodeId?: string }} payload
   * @param {{ newId?: () => string }} [options]  ids for the new entities (default: fresh ULIDs)
   */
  planExtract(payload, { newId = this.#newId } = {}) {
    return planExtract(this.#store, this.#registry, payload, newId)
  }

  /**
   * The primitive commands `system.inline` would run for a composite placed by value, without
   * running them: `{ commands, nodeIds }`.
   * @param {{ nodeId: string }} payload
   */
  planInline(payload) {
    return planInline(this.#store, this.#registry, payload)
  }

  /**
   * Follows a public method's bindings down through every level to the component that
   * implements it (spec §7): `{ nodeId, method, path }`, where `path` lists each hop from this
   * component down. Fails with E_METHOD_UNBOUND at a composite that has not bound it. With
   * `levels`, it stops that many hops down.
   * @param {string} nodeId
   * @param {string} method
   * @param {{ port?: string, levels?: number }} [options]  `port` is the exposing port's name,
   *   when there are several
   */
  resolveBinding(nodeId, method, options) {
    return resolveBinding(this.#store, this.#registry, nodeId, method, options)
  }

  /**
   * Visits every component of a system and of the systems below it, each once.
   * @param {string} systemId
   * @param {(node: any, where: { depth: number, systemId: string }) => void} visit
   * @param {{ maxDepth?: number }} [options]
   */
  walk(systemId, visit, options) {
    walk(this.#store, systemId, visit, options)
  }

  /**
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T}
   */
  transaction(fn, options) {
    return this.#bus.transaction(fn, options)
  }

  get inTransaction() {
    return this.#bus.inTransaction
  }
  undo() {
    return this.#bus.undo()
  }
  redo() {
    return this.#bus.redo()
  }
  get canUndo() {
    return this.#bus.canUndo
  }
  get canRedo() {
    return this.#bus.canRedo
  }
  clearHistory() {
    this.#bus.clearHistory()
  }
  /** Every operation applied in this session, oldest first. */
  get oplog() {
    return this.#bus.oplog
  }
  /** @param {Iterable<import('./bus.js').Operation>} ops @param {{ history?: boolean }} [options] */
  replay(ops, options) {
    return this.#bus.replay(ops, options)
  }

  /**
   * Adds a command type (plugins use the same API as the core).
   * @param {string} type
   * @param {(payload: any, ctx: import('./bus.js').HandlerContext) => any} handler
   * @param {import('./bus.js').CommandMeta} [meta]
   */
  register(type, handler, meta) {
    this.#bus.register(type, handler, meta)
  }
  commands() {
    return this.#bus.commands()
  }

  // --- events and persistence ----------------------------------------------------------------

  /**
   * Events: 'change' { op, changes }, 'op' (Operation), 'history' { canUndo, canRedo },
   * 'undo' / 'redo' { op, applied }, any event a command emits with `ctx.emit`, and '*' for
   * all of them. Events arrive after the commit; a change a listener starts is queued until
   * every listener has heard them.
   * @param {string} event
   * @param {Function} fn
   */
  on(event, fn) {
    return this.#emitter.on(event, fn)
  }
  /** @param {string} event @param {Function} fn */
  once(event, fn) {
    return this.#emitter.once(event, fn)
  }
  /** @param {string} event @param {Function} fn */
  off(event, fn) {
    this.#emitter.off(event, fn)
  }

  /** A JSON-ready copy of the model. */
  snapshot() {
    return this.#store.snapshot()
  }

  /**
   * The state hash: the SHA-256, in hex, of the snapshot as sorted-key JSON. Equal models
   * (entities, their audit fields and `rev`) hash the same however they were built.
   */
  stateHash() {
    return toHex(sha256(canonicalJson(this.snapshot())))
  }
}

/** @param {CoreOptions} [options] */
export function createCore(options) {
  return new Core(options)
}
