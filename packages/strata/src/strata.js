/**
 * The Strata facade (spec §4, §16): the one public API that every client uses (the web UI,
 * the browser console, the Node CLI, and later the SaaS API). It owns the open projects,
 * the active project, navigation and selection, and forwards every change to the core as a
 * command. Replacing the UI means writing new components against this object.
 */
import { Emitter, createCore, createRegistry, createUlidFactory, fail, typeRefOf } from '../../strata-core/src/index.js'
import { Collection } from './collection.js'
import { CORE, INSPECT } from './internal.js'
import { createMemoryStorage } from './storage.js'
import { ProjectsApi } from './projects.js'
import { EdgeHandle, NodeHandle, SystemHandle } from './handles.js'
import { formatTarget } from './format.js'
import { helpText, PLANNED } from './help.js'

/**
 * @typedef {object} Identity  local identity that signs operations (becomes an account in R4)
 * @property {string} id
 * @property {string} name
 * @property {string} color
 *
 * @typedef {object} StrataOptions
 * @property {import('./storage.js').StorageAdapter} [storage]  default: in-memory
 * @property {import('../../strata-core/src/index.js').Registry} [registry]  default: built-in base types
 * @property {Partial<Identity>} [identity]
 * @property {() => number} [clock]
 * @property {(n: number) => Uint8Array} [random]
 * @property {(text: string) => void} [output]  where print() and help() write (default console.log)
 */

export class Strata {
  #emitter = new Emitter()
  #registry
  #identity
  #clock
  #random
  #output
  /** @type {Map<string, import('./projects.js').ProjectHandle>} */
  #open = new Map()
  /** @type {import('./projects.js').ProjectHandle|null} */
  #active = null
  /** @type {{ projectId: string|null, ids: string[] }} */
  #selection = { projectId: null, ids: [] }

  /** @param {StrataOptions} [options] */
  constructor ({ storage = createMemoryStorage(), registry = createRegistry(), identity = {}, clock = Date.now, random, output } = {}) {
    this.#registry = registry
    this.#clock = clock
    this.#random = random
    this.#output = output ?? (text => console.log(text))
    this.#identity = Object.freeze({
      id: identity.id ?? createUlidFactory({ now: clock, random })(),
      name: identity.name ?? 'Local user',
      color: identity.color ?? '#4f7cff'
    })

    const emit = (event, data) => this.#emitter.emit(event, data)
    this.projects = new ProjectsApi(this, {
      storage,
      emit,
      open: this.#open,
      now: () => new Date(this.#clock()).toISOString(),
      makeCore: snapshot => createCore({ registry: this.#registry, actorId: this.#identity.id, clock: this.#clock, random: this.#random, snapshot }),
      activate: project => {
        this.#active = project
        if (this.#selection.projectId !== project?.id) this.#selection = { projectId: project?.id ?? null, ids: [] }
      },
      active: () => this.#active
    })

    /** Component types (built-in and plugins share this registry). */
    this.components = Object.freeze({
      /** @param {unknown} manifest @param {{ replace?: boolean }} [options] */
      register: (manifest, options) => this.#registry.register(manifest, options),
      /** A manifest with inheritance applied. @param {string} name id, id@version or short name */
      get: name => this.#registry.resolve(typeRefOf(this.#registry.require(name))),
      list: () => Collection.from(this.#registry.list().map(m => ({
        id: m.id, name: m.name, version: m.version, category: m.category ?? '', extends: m.extends ?? '', abstract: m.abstract
      })))
    })

    for (const [name, info] of Object.entries(PLANNED)) this[name] = planned(name, info.release, info.what)
  }

  /** The local identity recorded as the author of every change. */
  get identity () { return this.#identity }

  /** The active project, or null. */
  get project () { return this.#active }

  #requireProject () {
    if (!this.#active) fail('INVALID', "No project is open. Create one with await strata.projects.create('name') or open one with await strata.projects.open('name').")
    return this.#active
  }

  /** Breadcrumb navigation of the active project. */
  get nav () { return this.#requireProject().nav }

  /**
   * The current selection: a handle, a Collection when several items are selected, or null.
   */
  get $ () {
    const project = this.#active
    if (!project || this.#selection.projectId !== project.id) return null
    const core = project[CORE]
    /** @type {(NodeHandle|EdgeHandle|SystemHandle)[]} */
    const handles = []
    for (const id of this.#selection.ids) {
      if (core.get('node', id)) handles.push(new NodeHandle(project, id))
      else if (core.get('edge', id)) handles.push(new EdgeHandle(project, id))
      else if (core.get('system', id)) handles.push(new SystemHandle(project, id))
    }
    if (handles.length === 0) return null
    return handles.length === 1 ? handles[0] : Collection.from(handles)
  }

  /**
   * Replaces the selection. Accepts handles, ids and arrays of them; no arguments clears it.
   * @param {...unknown} items
   */
  select (...items) {
    const project = this.#requireProject()
    const core = project[CORE]
    const ids = []
    for (const item of items.flat(Infinity)) {
      const id = typeof item === 'string' ? item : /** @type {any} */ (item)?.id
      if (typeof id !== 'string' || !(core.get('node', id) || core.get('edge', id) || core.get('system', id))) {
        fail('NOT_FOUND', `Cannot select ${String(item)}: not a node, edge or system of '${project.name}'`)
      }
      if (!ids.includes(id)) ids.push(id)
    }
    this.#selection = { projectId: project.id, ids }
    this.#emitter.emit('select', { project, ids: [...ids] })
    return this.$
  }

  /**
   * Applies a command to the active project.
   * @param {{ type: string, payload?: any }} command
   */
  dispatch (command) { return this.#requireProject().dispatch(command) }

  /**
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T}
   */
  transaction (fn, options) { return this.#requireProject().transaction(fn, options) }

  undo () { return this.#requireProject().undo() }
  redo () { return this.#requireProject().redo() }

  /** Commands available in the active project, with signatures. */
  commands () { return this.#requireProject().commands() }

  /**
   * Subscribes to 'change', 'history', 'navigate', 'select', 'project' or '*'.
   * @param {string} event
   * @param {Function} fn
   */
  on (event, fn) { return this.#emitter.on(event, fn) }
  /** @param {string} event @param {Function} fn */
  once (event, fn) { return this.#emitter.once(event, fn) }
  /** @param {string} event @param {Function} fn */
  off (event, fn) { this.#emitter.off(event, fn) }

  /**
   * Text rendering of a project, system, node or collection (default: the current system).
   * @param {unknown} [target]
   * @param {{ depth?: number, edges?: boolean }} [options]
   */
  format (target, options) {
    if (target === undefined) {
      if (!this.#active) return "No project is open. Try: await strata.projects.create('my-project')"
      target = this.#active.nav.current
    }
    return formatTarget(target, options)
  }

  /**
   * Prints `format(target)`.
   * @param {unknown} [target]
   * @param {{ depth?: number, edges?: boolean }} [options]
   */
  print (target, options) {
    this.#output(this.format(target, options))
  }

  /**
   * Prints help: the topic list, or commands with signatures and examples for one topic.
   * @param {string} [topic]
   */
  help (topic) {
    this.#output(helpText(topic))
  }

  /** @param {string} [topic] */
  helpText (topic) { return helpText(topic) }

  toString () {
    return `Strata<${this.#active ? this.#active.name : 'no project'}>`
  }

  [INSPECT] () { return this.toString() }
}

/**
 * A namespace that arrives in a later release: any call explains when.
 * @param {string} name
 * @param {string} release
 * @param {string} what
 */
function planned (name, release, what) {
  const message = `strata.${name} arrives in ${release} (${what}). See strata.help('${name}').`
  return new Proxy(Object.freeze({}), {
    get (_target, prop) {
      if (prop === Symbol.toStringTag) return `strata.${name} (${release})`
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      return () => fail('UNSUPPORTED', message)
    }
  })
}

/** @param {StrataOptions} [options] */
export function createStrata (options) {
  return new Strata(options)
}
