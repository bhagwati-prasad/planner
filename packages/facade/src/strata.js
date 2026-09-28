/**
 * The Strata facade (spec §4, §16): the one public API that every client uses (the web UI,
 * the browser console, the Node CLI, and later the SaaS API). It owns the open projects,
 * the active project, navigation and selection, and forwards every change to the core as a
 * command. Replacing the UI means writing new components against this object.
 */
import {
  Emitter,
  createCore,
  createRegistry,
  createUlidFactory,
  fail,
} from '../../core/src/index.js'
import { Collection } from './collection.js'
import { CORE, INSPECT } from './internal.js'
import { createMemoryStorage } from './storage.js'
import { ProjectsApi } from './projects.js'
import { EdgeHandle, NodeHandle, SystemHandle } from './handles.js'
import { formatTarget } from './format.js'
import { helpText, PLANNED } from './help.js'
import { copyNodes } from './clipboard.js'
import { ComponentsApi } from './components.js'
import { SimApi, inProcessSimHost } from './sim.js'

/**
 * @typedef {object} Identity  local identity that signs operations (becomes an account in R4)
 * @property {string} id
 * @property {string} name
 * @property {string} color
 *
 * @typedef {object} StrataOptions
 * @property {import('./storage.js').StorageAdapter} [storage]  default: in-memory
 * @property {import('../../core/src/index.js').Registry} [registry]  default: built-in base types
 * @property {Partial<Identity>} [identity]
 * @property {import('../../core/src/types.js').Clock} clock  required: the clock adapter (eng §6)
 * @property {import('../../core/src/types.js').RandomBytes} [random]  random bytes for ids (default: Web Crypto)
 * @property {(text: string) => void} [output]  where print() and help() write (default: nowhere)
 * @property {import('./sim.js').SimHost} [simHost]  runs simulations (default: in the calling thread)
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
  /** @type {import('./clipboard.js').Clip|null} */
  #clipboard = null

  /** @param {StrataOptions} [options] */
  constructor(
    {
      storage = createMemoryStorage(),
      registry = createRegistry(),
      identity = {},
      clock,
      random,
      output = () => {},
      simHost = inProcessSimHost,
    } = /** @type {any} */ ({})
  ) {
    if (typeof clock !== 'function')
      fail(
        'E_ADAPTER_MISSING',
        'createStrata needs a clock adapter: () => epoch milliseconds (eng §6). The app and the CLI pass real adapters; tests pass fakes from tools/testing'
      )
    this.#registry = registry
    this.#clock = clock
    this.#random = random
    this.#output = output
    this.#identity = Object.freeze({
      id: identity.id ?? createUlidFactory({ now: clock, random })(),
      name: identity.name ?? 'Local user',
      color: identity.color ?? '#4f7cff',
    })

    const emit = (event, data) => this.#emitter.emit(event, data)
    this.projects = new ProjectsApi(this, {
      storage,
      emit,
      open: this.#open,
      now: () => new Date(this.#clock()).toISOString(),
      makeCore: snapshot =>
        createCore({
          registry: this.#registry,
          actorId: this.#identity.id,
          clock: this.#clock,
          random: this.#random,
          snapshot,
        }),
      activate: project => {
        this.#active = project
        if (this.#selection.projectId !== project?.id)
          this.#selection = { projectId: project?.id ?? null, ids: [] }
      },
      active: () => this.#active,
    })

    /** Component types (built-in types, manifests and packed plugins share one registry). */
    this.components = new ComponentsApi(this.#registry, emit)

    /** Simulation (spec §11): one request over one edge so far. */
    this.sim = new SimApi(this, simHost)

    for (const [name, info] of Object.entries(PLANNED))
      this[name] = planned(name, info.release, info.what)
  }

  /** The local identity recorded as the author of every change. */
  get identity() {
    return this.#identity
  }

  /** The active project, or null. */
  get project() {
    return this.#active
  }

  #requireProject() {
    if (!this.#active)
      fail(
        'INVALID',
        "No project is open. Create one with await strata.projects.create('name') or open one with await strata.projects.open('name')."
      )
    return this.#active
  }

  /** Breadcrumb navigation of the active project. */
  get nav() {
    return this.#requireProject().nav
  }

  /**
   * The current selection: a handle, a Collection when several items are selected, or null.
   */
  get $() {
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
   * @example strata.select(svc, db); strata.$.ids()
   */
  select(...items) {
    const project = this.#requireProject()
    const core = project[CORE]
    const ids = []
    for (const item of items.flat(Infinity)) {
      const id = typeof item === 'string' ? item : /** @type {any} */ (item)?.id
      if (
        typeof id !== 'string' ||
        !(core.get('node', id) || core.get('edge', id) || core.get('system', id))
      ) {
        fail(
          'NOT_FOUND',
          `Cannot select ${String(item)}: not a node, edge or system of '${project.name}'`
        )
      }
      if (!ids.includes(id)) ids.push(id)
    }
    this.#selection = { projectId: project.id, ids }
    this.#emitter.emit('select', { project, ids: [...ids] })
    return this.$
  }

  /** The last clip copied in this session (plain JSON), or null. */
  get clipboard() {
    return this.#clipboard
  }

  /**
   * Copies nodes (default: the selected ones) with the edges between them.
   * @param {Iterable<string|{ id: string }>} [items]
   * @returns {import('./clipboard.js').Clip}
   * @example const clip = strata.copy([svc, db])
   */
  copy(items) {
    const project = this.#requireProject()
    const ids = items
      ? [...items].map(i => (typeof i === 'string' ? i : i.id))
      : this.#selection.ids
    this.#clipboard = copyNodes(project, ids)
    this.#emitter.emit('clipboard', { clip: this.#clipboard })
    return this.#clipboard
  }

  /**
   * Pastes the clipboard (or a given clip) into a system (default: the current one) and
   * selects what was pasted.
   * @param {{ clip?: import('./clipboard.js').Clip, into?: SystemHandle, at?: { x: number, y: number } }} [options]
   * @example strata.paste({ into: p.root, at: { x: 400, y: 100 } })
   */
  paste({ clip = this.#clipboard ?? undefined, into, at } = {}) {
    const project = this.#requireProject()
    if (!clip) fail('INVALID', 'The clipboard is empty; copy something first with strata.copy()')
    const target = into ?? project.nav.current
    const pasted = target.paste(clip, { at })
    if (pasted.length) this.select(pasted)
    return pasted
  }

  /**
   * Copies nodes and pastes them next to the originals (offset by 40), in the system of the
   * first one. Returns the copies, which become the selection.
   * @param {Iterable<string|{ id: string }>} [items] default: the selection
   * @example strata.duplicate([svc])
   */
  duplicate(items) {
    const project = this.#requireProject()
    const ids = items
      ? [...items].map(i => (typeof i === 'string' ? i : i.id))
      : this.#selection.ids
    const clip = copyNodes(project, ids)
    const nodes = ids.map(id => project[CORE].get('node', id)).filter(Boolean)
    const positions = nodes.map(n => new NodeHandle(project, n.id).position).filter(Boolean)
    const at = positions.length
      ? {
          x: Math.min(...positions.map(p => p.x)) + 40,
          y: Math.min(...positions.map(p => p.y)) + 40,
        }
      : undefined
    const pasted = new SystemHandle(project, nodes[0].systemId).paste(clip, { at })
    if (pasted.length) this.select(pasted)
    return pasted
  }

  /**
   * Applies a command to the active project.
   * @param {{ type: string, payload?: any }} command
   * @example strata.dispatch({ type: 'node.update', payload: { id: svc.id, changes: { owner: 'payments' } } })
   */
  dispatch(command) {
    return this.#requireProject().dispatch(command)
  }

  /**
   * Groups the commands `fn` dispatches into one undo step.
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T}
   * @example strata.transaction(() => { root.add('service'); root.add('cache') }, { label: 'Add a tier' })
   */
  transaction(fn, options) {
    return this.#requireProject().transaction(fn, options)
  }

  /**
   * Undoes the last operation in the active project.
   * @example strata.undo()
   */
  undo() {
    return this.#requireProject().undo()
  }
  /**
   * Redoes the last undone operation in the active project.
   * @example strata.redo()
   */
  redo() {
    return this.#requireProject().redo()
  }

  /**
   * Commands available in the active project, with signatures.
   * @example strata.commands().filter(c => c.type.startsWith('edge.'))
   */
  commands() {
    return this.#requireProject().commands()
  }

  /**
   * Subscribes to 'change', 'history', 'navigate', 'select', 'project' or '*'.
   * @param {string} event
   * @param {Function} fn
   * @example const stop = strata.on('change', ({ op }) => console.log(op.type))
   */
  on(event, fn) {
    return this.#emitter.on(event, fn)
  }
  /**
   * Subscribes to the next occurrence of an event only.
   * @param {string} event @param {Function} fn
   * @example strata.once('navigate', ({ breadcrumb }) => console.log(breadcrumb))
   */
  once(event, fn) {
    return this.#emitter.once(event, fn)
  }
  /**
   * Unsubscribes a listener.
   * @param {string} event @param {Function} fn
   * @example strata.off('change', listener)
   */
  off(event, fn) {
    this.#emitter.off(event, fn)
  }

  /**
   * Text rendering of a project, system, node or collection (default: the current system).
   * @param {unknown} [target]
   * @param {{ depth?: number, edges?: boolean }} [options]
   * @example const text = strata.format(root, { depth: 1 })
   */
  format(target, options) {
    if (target === undefined) {
      if (!this.#active)
        return "No project is open. Try: await strata.projects.create('my-project')"
      target = this.#active.nav.current
    }
    return formatTarget(target, options)
  }

  /**
   * Prints `format(target)`.
   * @param {unknown} [target]
   * @param {{ depth?: number, edges?: boolean }} [options]
   * @example strata.print(root)
   */
  print(target, options) {
    this.#output(this.format(target, options))
  }

  /**
   * Prints help: the topic list, or commands with signatures and examples for one topic.
   * @param {string} [topic]
   * @example strata.help('system')
   */
  help(topic) {
    this.#output(helpText(topic))
  }

  /**
   * The text strata.help(topic) prints.
   * @param {string} [topic]
   * @example strata.helpText('nav')
   */
  helpText(topic) {
    return helpText(topic)
  }

  /**
   * Names the active project, such as Strata<checkout>.
   * @example String(strata)
   */
  toString() {
    return `Strata<${this.#active ? this.#active.name : 'no project'}>`
  }

  [INSPECT]() {
    return this.toString()
  }
}

/**
 * A namespace that arrives in a later release: any call explains when.
 * @param {string} name
 * @param {string} release
 * @param {string} what
 */
function planned(name, release, what) {
  const message = `strata.${name} arrives in ${release} (${what}). See strata.help('${name}').`
  return new Proxy(Object.freeze({}), {
    get(_target, prop) {
      if (prop === Symbol.toStringTag) return `strata.${name} (${release})`
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      return () => fail('UNSUPPORTED', message)
    },
  })
}

/**
 * Creates the console API over the adapters the environment provides.
 * @param {StrataOptions} [options]
 * @example const strata = createStrata({ clock: () => Date.now() })
 */
export function createStrata(options) {
  return new Strata(options)
}
