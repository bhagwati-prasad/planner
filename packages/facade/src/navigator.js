/**
 * Drill-down navigation (spec §6 "Drill-down"): the breadcrumb path from the root system to
 * the system being viewed. It is per-project, per-tab working state (sessionStorage in M5);
 * any attached UI follows the 'navigate' event.
 */
import { fail, nodeKind } from '../../core/src/index.js'
import { Collection } from './collection.js'
import { CORE } from './internal.js'
import { NodeHandle, SystemHandle, resolveSystemId } from './handles.js'

/** @typedef {{ systemId: string, viaNodeId: string|null }} PathEntry */

export class Navigator {
  #project
  #emit
  /** @type {PathEntry[]} */
  #path = []

  /**
   * @param {import('./projects.js').ProjectHandle} project
   * @param {(event: string, data: unknown) => void} emit
   */
  constructor(project, emit) {
    this.#project = project
    this.#emit = emit
    this.#path = [{ systemId: this.#core.rootSystemId, viaNodeId: null }]
  }

  get #core() {
    return this.#project[CORE]
  }

  /** Systems from the top of the breadcrumb to the current one. */
  get path() {
    let readOnly = false
    return Collection.from(
      this.#path.map(({ systemId, viaNodeId }) => {
        if (viaNodeId && this.#core.get('node', viaNodeId)?.placement === 'reference')
          readOnly = true
        return new SystemHandle(this.#project, systemId, { via: viaNodeId, readOnly })
      })
    )
  }

  /** The system being viewed. */
  get current() {
    return this.path.at(-1)
  }

  /** Depth below the top of the breadcrumb (0 at the root). */
  get depth() {
    return this.#path.length - 1
  }

  /** e.g. "Checkout › Payments › Ledger" */
  get breadcrumb() {
    return this.#path
      .map(({ systemId }) => this.#core.get('system', systemId)?.name ?? '?')
      .join(' › ')
  }

  /**
   * Drills into a composite node, or navigates to a system by handle, id or name.
   * @param {NodeHandle|SystemHandle|string} target
   */
  enter(target) {
    const core = this.#core
    const here = this.#path.at(-1)
    const nodeId =
      target instanceof NodeHandle
        ? target.id
        : typeof target === 'string' && core.get('node', target)
          ? target
          : null

    if (nodeId) {
      const node = core.require('node', nodeId)
      if (nodeKind(node) !== 'composite')
        fail('INVALID', `'${node.name}' is not a composite; there is nothing to enter`)
      if (node.systemId !== here.systemId) this.#path = this.#bestPath(node.systemId, null)
      this.#path = [...this.#path, { systemId: node.innerSystemRef, viaNodeId: node.id }]
      return this.#changed()
    }

    const systemId = resolveSystemId(this.#project, /** @type {any} */ (target))
    const via = target instanceof SystemHandle ? (target.via?.id ?? null) : null
    if (systemId === here.systemId && (!via || via === here.viaNodeId)) return this.current
    const inHere = core
      .nodesOf(here.systemId)
      .filter(n => nodeKind(n) === 'composite' && n.innerSystemRef === systemId)
    if (inHere.length) {
      const pick = inHere.find(n => n.id === via) ?? inHere[0]
      this.#path = [...this.#path, { systemId, viaNodeId: pick.id }]
    } else {
      this.#path = this.#bestPath(systemId, via)
    }
    return this.#changed()
  }

  /** Goes up one level; returns the new current system. */
  up() {
    if (this.#path.length > 1) {
      this.#path = this.#path.slice(0, -1)
      this.#changed()
    }
    return this.current
  }

  /** Back to the root system. */
  home() {
    this.#path = [{ systemId: this.#core.rootSystemId, viaNodeId: null }]
    return this.#changed()
  }

  /** Plain path entries, for persisting per-tab state. */
  toJSON() {
    return this.#path.map(entry => ({ ...entry }))
  }

  /**
   * Restores saved path entries; invalid tails are dropped.
   * @param {PathEntry[]} entries
   */
  restore(entries) {
    this.#path = entries.map(({ systemId, viaNodeId }) => ({
      systemId,
      viaNodeId: viaNodeId ?? null,
    }))
    if (!this.#valid(0)) this.#path = [{ systemId: this.#core.rootSystemId, viaNodeId: null }]
    this.sync()
    return this.current
  }

  /** Drops path entries the model no longer supports (called after every change). */
  sync() {
    for (let i = 0; i < this.#path.length; i++) {
      if (!this.#valid(i)) {
        this.#path =
          i === 0
            ? [{ systemId: this.#core.rootSystemId, viaNodeId: null }]
            : this.#path.slice(0, i)
        this.#changed()
        return
      }
    }
  }

  #valid(i) {
    const core = this.#core
    const { systemId, viaNodeId } = this.#path[i]
    if (!core.get('system', systemId)) return false
    if (i === 0) return true
    const via = viaNodeId && core.get('node', viaNodeId)
    return !!via && via.systemId === this.#path[i - 1].systemId && via.innerSystemRef === systemId
  }

  /** The path from the root that reaches `systemId` (preferring one through `via`). */
  #bestPath(systemId, via) {
    const paths = this.#core.pathsTo(systemId)
    const chosen =
      paths.find(p => via && p.at(-1)?.viaNodeId === via) ??
      paths.find(p =>
        this.#path.every(
          (entry, i) => p[i]?.systemId === entry.systemId && p[i]?.viaNodeId === entry.viaNodeId
        )
      ) ??
      paths[0]
    return chosen ? chosen.map(entry => ({ ...entry })) : [{ systemId, viaNodeId: null }]
  }

  #changed() {
    const current = this.current
    this.#emit('navigate', {
      project: this.#project,
      path: this.toJSON(),
      breadcrumb: this.breadcrumb,
      current,
    })
    return current
  }
}
