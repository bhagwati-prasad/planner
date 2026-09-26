/**
 * The headless core (spec §4): one project's model plus the command bus that changes it.
 * It has no DOM dependency and runs unchanged on the main thread, in a worker and in Node.
 * Reads return frozen plain objects; changes arrive as events.
 */
import { Emitter } from './emitter.js'
import { fail } from './errors.js'
import { Store } from './store.js'
import { CommandBus } from './bus.js'
import { createRegistry } from './registry.js'
import { createUlidFactory } from './ulid.js'
import { registerCoreCommands } from './commands/index.js'
import { rollup, checkContracts } from './rollup.js'
import { findProblems } from './validate.js'
import {
  acceptsOf, boundaryPortsOf, childSystemIds, connectionTypeOf, containsSystem, edgesAtPort, edgesOf, effectiveProps,
  explainProps, manifestOf, nodesOf, pathsTo, portsOf, projectOf, referencingNodes, resolvePort,
  subtreeSystemIds, viewsOf, wouldCycle
} from './model.js'

/**
 * @typedef {object} CoreOptions
 * @property {import('./registry.js').Registry} [registry]  component types (default: built-in base types)
 * @property {string} [actorId]   author recorded on every operation and entity
 * @property {() => number} [clock]  milliseconds since the epoch (inject for tests and replay)
 * @property {(n: number) => Uint8Array} [random]  random bytes for ULIDs (inject for tests)
 * @property {Record<string, any>} [snapshot]  model to load, from `snapshot()`
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

  /** @param {CoreOptions} [options] */
  constructor ({ registry = createRegistry(), actorId = 'local', clock = Date.now, random, snapshot } = {}) {
    this.#registry = registry
    this.#store = new Store()
    if (snapshot) this.#store.load(snapshot)
    this.#bus = new CommandBus({
      store: this.#store,
      emitter: this.#emitter,
      newId: createUlidFactory({ now: clock, random }),
      clock,
      actorId,
      services: { registry }
    })
    registerCoreCommands(this.#bus)
  }

  // --- identity and state ------------------------------------------------------------------

  get registry () { return this.#registry }
  /** Model revision: number of operations applied since the project was created. */
  get rev () { return this.#store.rev }
  get actorId () { return this.#bus.actorId }
  set actorId (id) { this.#bus.actorId = id }
  get project () { return projectOf(this.#store) }
  get rootSystemId () { return this.project?.rootSystemId ?? null }

  // --- generic reads -------------------------------------------------------------------------

  /** @param {string} kind @param {string} id */
  get (kind, id) { return this.#store.get(kind, id) }
  /** @param {string} kind @param {string} id */
  require (kind, id) { return this.#store.require(kind, id) }
  /** @param {string} kind */
  all (kind) { return this.#store.all(kind) }
  /** @param {string} kind @param {string} field @param {unknown} value */
  find (kind, field, value) { return this.#store.find(kind, field, value) }

  /** @param {string} id */ system (id) { return this.#store.get('system', id) }
  /** @param {string} id */ node (id) { return this.#store.get('node', id) }
  /** @param {string} id */ port (id) { return this.#store.get('port', id) }
  /** @param {string} id */ edge (id) { return this.#store.get('edge', id) }
  /** @param {string} id */ boundaryPort (id) { return this.#store.get('boundaryPort', id) }
  /** @param {string} id */ view (id) { return this.#store.get('view', id) }

  // --- structure -----------------------------------------------------------------------------

  /** @param {string} systemId */ nodesOf (systemId) { return nodesOf(this.#store, systemId) }
  /** @param {string} systemId */ edgesOf (systemId) { return edgesOf(this.#store, systemId) }
  /** @param {string} nodeId */ portsOf (nodeId) { return portsOf(this.#store, nodeId) }
  /** @param {string} systemId */ boundaryPortsOf (systemId) { return boundaryPortsOf(this.#store, systemId) }
  /** @param {string} systemId */ viewsOf (systemId) { return viewsOf(this.#store, systemId) }
  /** @param {string} portId */ edgesAtPort (portId) { return edgesAtPort(this.#store, portId) }
  /** Composite nodes that place a system. @param {string} systemId */
  referencingNodes (systemId) { return referencingNodes(this.#store, systemId) }
  /** @param {string} systemId */ childSystemIds (systemId) { return childSystemIds(this.#store, systemId) }
  /** @param {string} systemId */ subtreeSystemIds (systemId) { return subtreeSystemIds(this.#store, systemId) }
  /** @param {string} outer @param {string} inner */ containsSystem (outer, inner) { return containsSystem(this.#store, outer, inner) }
  /** @param {string} containerId @param {string} childId */ wouldCycle (containerId, childId) { return wouldCycle(this.#store, containerId, childId) }
  /** @param {string} systemId @param {{ limit?: number }} [options] */ pathsTo (systemId, options) { return pathsTo(this.#store, systemId, options) }
  /** @param {string} portId */ resolvePort (portId) { return resolvePort(this.#store, portId) }

  /**
   * Views of the element's system in which it is visible (for the "remove from model"
   * confirmation, spec §5).
   * @param {string} elementId node or edge id
   */
  viewsContaining (elementId) {
    const element = this.#store.get('node', elementId) ?? this.#store.get('edge', elementId)
    if (!element) fail('NOT_FOUND', `No node or edge '${elementId}'`)
    return viewsOf(this.#store, element.systemId).filter(v => !v.hidden.includes(elementId))
  }

  /**
   * Nodes matching a filter, in id order.
   * @param {NodeFilter} [filter]
   */
  nodes (filter = {}) {
    let list
    if (filter.systemId) {
      const ids = filter.deep ? subtreeSystemIds(this.#store, filter.systemId) : [filter.systemId]
      list = ids.flatMap(id => nodesOf(this.#store, id))
    } else {
      list = this.#store.all('node')
    }
    return list.filter(n =>
      (filter.kind === undefined || n.kind === filter.kind) &&
      (filter.type === undefined || n.typeRef === filter.type || n.typeRef?.startsWith(`${filter.type}@`)) &&
      (filter.extends === undefined || (!!n.typeRef && this.#registry.isA(n.typeRef, filter.extends))) &&
      (filter.tag === undefined || n.tags.includes(filter.tag)) &&
      (filter.status === undefined || n.status === filter.status) &&
      (filter.owner === undefined || n.owner === filter.owner) &&
      (filter.name === undefined || n.name === filter.name)
    )
  }

  // --- properties ----------------------------------------------------------------------------

  #nodeArg (nodeOrId) {
    return typeof nodeOrId === 'string' ? this.#store.require('node', nodeOrId) : nodeOrId
  }

  /** A node or an edge, by id or entity. */
  #propsArg (idOrEntity) {
    if (typeof idOrEntity !== 'string') return idOrEntity
    return this.#store.get('node', idOrEntity) ?? this.#store.require('edge', idOrEntity)
  }

  /** @param {string|object} node */ manifestOf (node) { return manifestOf(this.#registry, this.#nodeArg(node)) }
  /** @param {string|object} edge */ connectionTypeOf (edge) { return connectionTypeOf(this.#registry, typeof edge === 'string' ? this.#store.require('edge', edge) : edge) }
  /** @param {string|object} entity a node or an edge */ effectiveProps (entity) { return effectiveProps(this.#registry, this.#propsArg(entity)) }
  /** @param {string|object} entity a node or an edge */ explainProps (entity) { return explainProps(this.#registry, this.#propsArg(entity)) }
  /** @param {string|object} port */
  acceptsOf (port) {
    return acceptsOf(this.#store, typeof port === 'string' ? this.#store.require('port', port) : port)
  }

  // --- derived values and problems -----------------------------------------------------------

  /**
   * @param {string} systemId
   * @param {string} key
   * @param {import('./rollup.js').RollupOptions} [options]
   */
  rollup (systemId, key, options) { return rollup(this.#store, this.#registry, systemId, key, options) }

  /** @param {string} systemId @param {import('./rollup.js').RollupOptions} [options] */
  checkContracts (systemId, options) { return checkContracts(this.#store, this.#registry, systemId, options) }

  /** @param {{ contracts?: boolean }} [options] */
  problems (options) { return findProblems(this.#store, this.#registry, options) }

  // --- commands ------------------------------------------------------------------------------

  /**
   * @param {{ type: string, payload?: any }} command
   * @param {import('./bus.js').DispatchOptions} [options]
   */
  dispatch (command, options) { return this.#bus.dispatch(command, options) }

  /**
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T}
   */
  transaction (fn, options) { return this.#bus.transaction(fn, options) }

  get inTransaction () { return this.#bus.inTransaction }
  undo () { return this.#bus.undo() }
  redo () { return this.#bus.redo() }
  get canUndo () { return this.#bus.canUndo }
  get canRedo () { return this.#bus.canRedo }
  clearHistory () { this.#bus.clearHistory() }
  /** Every operation applied in this session, oldest first. */
  get oplog () { return this.#bus.oplog }
  /** @param {Iterable<import('./bus.js').Operation>} ops @param {{ history?: boolean }} [options] */
  replay (ops, options) { return this.#bus.replay(ops, options) }

  /**
   * Adds a command type (plugins use the same API as the core).
   * @param {string} type
   * @param {(payload: any, ctx: import('./bus.js').HandlerContext) => any} handler
   * @param {{ undoable?: boolean, description?: string, signature?: string, replace?: boolean }} [meta]
   */
  register (type, handler, meta) { this.#bus.register(type, handler, meta) }
  commands () { return this.#bus.commands() }

  // --- events and persistence ----------------------------------------------------------------

  /**
   * Events: 'change' { op, changes }, 'op' (Operation), 'history' { canUndo, canRedo },
   * 'undo' / 'redo' { op, applied }, and '*' for all of them.
   * @param {string} event
   * @param {Function} fn
   */
  on (event, fn) { return this.#emitter.on(event, fn) }
  /** @param {string} event @param {Function} fn */
  once (event, fn) { return this.#emitter.once(event, fn) }
  /** @param {string} event @param {Function} fn */
  off (event, fn) { this.#emitter.off(event, fn) }

  /** A JSON-ready copy of the model. */
  snapshot () { return this.#store.snapshot() }
}

/** @param {CoreOptions} [options] */
export function createCore (options) {
  return new Core(options)
}
