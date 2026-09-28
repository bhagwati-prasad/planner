/**
 * Projects: opening, creating, listing and saving them, and the ProjectHandle every other
 * handle hangs off. One `.strata` file = one project (spec §5).
 */
import { fail } from '../../core/src/index.js'
import { Collection } from './collection.js'
import { CORE, INSPECT } from './internal.js'
import { Navigator } from './navigator.js'
import { EdgeHandle, NodeHandle, SystemHandle, resolveSystemId } from './handles.js'

/** @typedef {import('../../core/src/index.js').Core} Core */

export class ProjectHandle {
  #strata
  #core
  #nav
  #unsubscribe
  #closed = false

  /**
   * @param {import('./strata.js').Strata} strata
   * @param {Core} core
   * @param {(event: string, data: unknown) => void} emit
   */
  constructor(strata, core, emit) {
    this.#strata = strata
    this.#core = core
    this.#nav = new Navigator(this, emit)
    const offChange = core.on('change', ({ op, changes }) => {
      this.#nav.sync()
      emit('change', { project: this, op, changes })
    })
    const offHistory = core.on('history', h => emit('history', { project: this, ...h }))
    this.#unsubscribe = () => {
      offChange()
      offHistory()
    }
  }

  /** @internal */
  get [CORE]() {
    return this.#core
  }
  get strata() {
    return this.#strata
  }
  get id() {
    return this.#core.project.id
  }
  get name() {
    return this.#core.project.name
  }
  get description() {
    return this.#core.project.description
  }
  /** Model revision: operations applied since the project was created. */
  get rev() {
    return this.#core.rev
  }
  get closed() {
    return this.#closed
  }
  /** Breadcrumb navigation for this project. */
  get nav() {
    return this.#nav
  }
  get root() {
    return new SystemHandle(this, this.#core.rootSystemId)
  }
  /** The system currently being viewed (see nav). */
  get current() {
    return this.#nav.current
  }

  /**
   * A system by id or name, editable (not through any placement).
   * @param {string} idOrName
   * @example p.system('Payments').add('service')
   */
  system(idOrName) {
    return new SystemHandle(this, resolveSystemId(this, idOrName))
  }

  /**
   * Every system in the project.
   * @example p.systems().map(s => s.name)
   */
  systems() {
    return Collection.from(this.#core.all('system').map(s => new SystemHandle(this, s.id)))
  }

  /**
   * Library systems: reusable by reference, not owned by any composite.
   * @example p.library().toTable()
   */
  library() {
    return Collection.from(this.systems().filter(s => s.isLibrary))
  }

  /**
   * A node anywhere in the project, by id or unique name.
   * @param {string} idOrName
   * @example p.node('Orders').props
   */
  node(idOrName) {
    if (this.#core.get('node', idOrName)) return new NodeHandle(this, idOrName)
    const matches = this.#core.nodes({ name: idOrName })
    if (matches.length === 1) return new NodeHandle(this, matches[0].id)
    if (matches.length > 1)
      fail(
        'AMBIGUOUS',
        `Several nodes are named '${idOrName}'; use an id or system.node(name)`,
        matches.map(n => n.id)
      )
    return fail('NOT_FOUND', `No node '${idOrName}' in project '${this.name}'`)
  }

  /**
   * An edge by id, or by label when exactly one edge has it.
   * @param {string} idOrLabel
   * @example p.edge('checkout call').update({ label: 'checkout' })
   */
  edge(idOrLabel) {
    if (this.#core.get('edge', idOrLabel)) return new EdgeHandle(this, idOrLabel)
    const matches = this.#core.all('edge').filter(e => e.label === idOrLabel)
    if (matches.length === 1) return new EdgeHandle(this, matches[0].id)
    if (matches.length > 1)
      fail(
        'AMBIGUOUS',
        `Several edges are labelled '${idOrLabel}'; use an id or port.edges()`,
        matches.map(e => e.id)
      )
    return fail('NOT_FOUND', `No edge '${idOrLabel}' in project '${this.name}'`)
  }

  /**
   * Nodes across the project, e.g. `{ extends: 'base:queue' }` or `{ status: 'planned' }`.
   * @param {import('../../core/src/core.js').NodeFilter} [filter]
   * @example p.nodes({ extends: 'base:queue' })
   */
  nodes(filter) {
    return Collection.from(this.#core.nodes(filter).map(n => new NodeHandle(this, n.id)))
  }

  /**
   * Creates a library system (placeable by reference or by value).
   * @param {string} name
   * @param {{ levelTag?: string, description?: string, contract?: object, tags?: string[] }} [options]
   * @example const auth = p.createSystem('Auth', { levelTag: 'container' })
   */
  createSystem(name, options = {}) {
    const id = this.dispatch({ type: 'system.create', payload: { name, ...options } })
    return new SystemHandle(this, id)
  }

  /**
   * Renames the project.
   * @param {string} name
   * @example p.rename('checkout-v2')
   */
  rename(name) {
    this.dispatch({ type: 'project.update', payload: { changes: { name } } })
    return this
  }

  /**
   * Applies a command. Every UI action, console call and script goes through here.
   * @param {{ type: string, payload?: any }} command
   * @example p.dispatch({ type: 'system.update', payload: { id: p.root.id, changes: { name: 'Shop' } } })
   */
  dispatch(command) {
    if (this.#closed) fail('INVALID', `Project '${this.name}' is closed`)
    return this.#core.dispatch(command)
  }

  /**
   * Groups the commands `fn` dispatches into one undo step.
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T}
   * @example p.transaction(() => p.root.add('cache'), { label: 'Add a cache' })
   */
  transaction(fn, options) {
    if (this.#closed) fail('INVALID', `Project '${this.name}' is closed`)
    return this.#core.transaction(fn, options)
  }

  /**
   * Undoes the last operation.
   * @example p.undo()
   */
  undo() {
    return !!this.#core.undo()
  }
  /**
   * Redoes the last undone operation.
   * @example p.redo()
   */
  redo() {
    return !!this.#core.redo()
  }
  get canUndo() {
    return this.#core.canUndo
  }
  get canRedo() {
    return this.#core.canRedo
  }
  /**
   * Forgets undo and redo history (the operation log is kept).
   * @example p.clearHistory()
   */
  clearHistory() {
    this.#core.clearHistory()
  }

  /** Operations applied in this session. */
  get oplog() {
    return Collection.from(this.#core.oplog)
  }

  /**
   * Problems across the whole project.
   * @example console.table(p.problems())
   */
  problems() {
    return Collection.from(this.#core.problems())
  }

  /**
   * Available commands with signatures.
   * @example p.commands().get('edge.add')
   */
  commands() {
    return Collection.from(this.#core.commands())
  }

  /**
   * JSON-ready copy of the model.
   * @example const json = JSON.stringify(p.snapshot())
   */
  snapshot() {
    return this.#core.snapshot()
  }

  /**
   * Writes the project to the configured storage.
   * @example await p.save()
   */
  async save() {
    await this.#strata.projects.save(this)
    return this
  }

  /**
   * Closes the project (see strata.projects.close).
   * @example p.close()
   */
  close() {
    this.#strata.projects.close(this)
  }

  /** @internal Called by ProjectsApi.close. */
  _detach() {
    this.#unsubscribe()
    this.#closed = true
  }

  /**
   * Text tree of the project: its root system, then its library.
   * @param {{ depth?: number }} [options]
   * @example p.format({ depth: 2 })
   */
  format(options) {
    return this.#strata.format(this, options)
  }

  /**
   * A row describing the project, for console.table.
   * @example console.table([p.toRow()])
   */
  toRow() {
    return {
      id: this.id,
      name: this.name,
      systems: this.#core.all('system').length,
      nodes: this.#core.all('node').length,
      rev: this.rev,
    }
  }

  /**
   * The row, for JSON.stringify.
   * @example JSON.stringify(p)
   */
  toJSON() {
    return this.toRow()
  }
  /**
   * A short label such as Project<checkout>.
   * @example String(p)
   */
  toString() {
    return `Project<${this.#closed ? 'closed ' : ''}${this.#core.project?.name}>`
  }
  [INSPECT]() {
    return this.toString()
  }
}

/**
 * `strata.projects`
 */
export class ProjectsApi {
  #strata
  #hooks

  /**
   * @param {import('./strata.js').Strata} strata
   * @param {{ storage: import('./storage.js').StorageAdapter, makeCore: (snapshot?: object) => Core, emit: (event: string, data: unknown) => void, now: () => string, open: Map<string, ProjectHandle>, activate: (p: ProjectHandle|null) => void, active: () => ProjectHandle|null }} hooks
   */
  constructor(strata, hooks) {
    this.#strata = strata
    this.#hooks = hooks
  }

  /**
   * Creates a project, saves it and makes it active.
   * @param {string} name
   * @param {{ id?: string, activate?: boolean }} [options]
   * @example const p = await strata.projects.create('checkout')
   */
  async create(name, { id, activate = true } = {}) {
    const { makeCore, emit, open, storage } = this.#hooks
    if (id && (open.has(id) || (await storage.load(id))))
      fail('CONFLICT', `A project with id '${id}' already exists`)
    const core = makeCore()
    core.dispatch({ type: 'project.init', payload: id === undefined ? { name } : { name, id } })
    const project = new ProjectHandle(this.#strata, core, emit)
    open.set(project.id, project)
    await this.save(project)
    emit('project', { action: 'create', project })
    if (activate) this.use(project)
    return project
  }

  /**
   * Opens a saved project by id or name (already-open projects are just activated).
   * @param {string} nameOrId
   * @param {{ activate?: boolean }} [options]
   * @example const p = await strata.projects.open('checkout')
   */
  async open(nameOrId, { activate = true } = {}) {
    const { storage, makeCore, emit, open } = this.#hooks
    let project = open.get(nameOrId) ?? [...open.values()].find(p => p.name === nameOrId)
    if (!project) {
      const saved = await storage.list()
      const exact = saved.filter(r => r.id === nameOrId || r.name === nameOrId)
      const matches = exact.length
        ? exact
        : saved.filter(r => r.name.toLowerCase() === String(nameOrId).toLowerCase())
      if (matches.length > 1)
        fail(
          'AMBIGUOUS',
          `Several projects are named '${nameOrId}'; open one by id (${matches.map(r => r.id).join(', ')})`
        )
      if (!matches.length) {
        const names = saved.map(r => `'${r.name}'`).join(', ')
        fail(
          'NOT_FOUND',
          `No project '${nameOrId}'. ${names ? `Saved projects: ${names}.` : 'No projects are saved yet.'} Create one with strata.projects.create('${nameOrId}').`
        )
      }
      const record = await storage.load(matches[0].id)
      if (!record) fail('NOT_FOUND', `Project '${nameOrId}' could not be loaded`)
      project = new ProjectHandle(this.#strata, makeCore(record.snapshot), emit)
      open.set(project.id, project)
      emit('project', { action: 'open', project })
    }
    if (activate) this.use(project)
    return project
  }

  /**
   * Saved projects, with whether each is open.
   * @example console.table(await strata.projects.list())
   */
  async list() {
    const saved = await this.#hooks.storage.list()
    return Collection.from(saved.map(r => ({ ...r, open: this.#hooks.open.has(r.id) })))
  }

  /**
   * Projects open in this session.
   * @example strata.projects.opened().map(p => p.name)
   */
  opened() {
    return Collection.from(this.#hooks.open.values())
  }

  /** The active project, or null. */
  get active() {
    return this.#hooks.active()
  }

  /**
   * Makes an open project the active one.
   * @param {ProjectHandle|string} projectOrId
   * @example strata.projects.use('checkout')
   */
  use(projectOrId) {
    const project = this.#resolveOpen(projectOrId)
    this.#hooks.activate(project)
    this.#hooks.emit('project', { action: 'activate', project })
    return project
  }

  /**
   * Writes an open project to storage.
   * @param {ProjectHandle} project
   * @example await strata.projects.save(p)
   */
  async save(project) {
    await this.#hooks.storage.save({
      id: project.id,
      name: project.name,
      updatedAt: this.#hooks.now(),
      snapshot: project.snapshot(),
    })
  }

  /**
   * Closes an open project (unsaved changes stay unsaved).
   * @param {ProjectHandle|string} projectOrId
   * @example strata.projects.close('checkout')
   */
  close(projectOrId) {
    const project = this.#resolveOpen(projectOrId)
    const { open, emit } = this.#hooks
    open.delete(project.id)
    project._detach()
    if (this.#hooks.active() === project) this.#hooks.activate([...open.values()].at(-1) ?? null)
    emit('project', { action: 'close', project })
  }

  /**
   * Deletes a saved project (closing it first). Confirmation is the caller's job.
   * @param {ProjectHandle|string} projectOrId
   * @example await strata.projects.delete('checkout')
   */
  async delete(projectOrId) {
    let id = projectOrId instanceof ProjectHandle ? projectOrId.id : projectOrId
    if (this.#hooks.open.has(id) || [...this.#hooks.open.values()].some(p => p.name === id)) {
      const project = this.#resolveOpen(id)
      id = project.id
      this.close(project)
    } else {
      const match = (await this.#hooks.storage.list()).find(r => r.id === id || r.name === id)
      if (!match) fail('NOT_FOUND', `No project '${projectOrId}'`)
      id = match.id
    }
    await this.#hooks.storage.remove(id)
    this.#hooks.emit('project', { action: 'delete', id })
  }

  #resolveOpen(projectOrId) {
    if (projectOrId instanceof ProjectHandle) {
      if (!this.#hooks.open.has(projectOrId.id))
        fail('INVALID', `Project '${projectOrId.name}' is not open`)
      return projectOrId
    }
    const open = this.#hooks.open
    const project = open.get(projectOrId) ?? [...open.values()].find(p => p.name === projectOrId)
    if (!project) fail('NOT_FOUND', `Project '${projectOrId}' is not open`)
    return project
  }

  /**
   * Names the namespace.
   * @example String(strata.projects)
   */
  toString() {
    return 'strata.projects'
  }
}
