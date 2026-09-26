/**
 * The shell: UI state shared by the workspace elements. It holds the selection as graph ids
 * (which may include boundary ports or ghosts, not only model ids), routes UI events between
 * panels, keeps the action registry used by the command palette, context menu, toolbar and
 * keyboard shortcuts, and shows notifications.
 */

/**
 * @typedef {object} Action
 * @property {string} id
 * @property {string} title
 * @property {string} [group]
 * @property {string} [shortcut]  shown in menus, e.g. 'Ctrl+Z'
 * @property {(shell: Shell, context?: any) => boolean} [enabled]
 * @property {(shell: Shell, context?: any) => unknown} run
 */

export class Shell {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map()
  /** @type {Map<string, Action>} */
  #actions = new Map()
  /** @type {string[]} */
  #selection = []
  /** Current theme; <strata-app> sets it and emits 'theme' when it changes. @type {'light'|'dark'} */
  theme = 'light'

  /**
   * @param {import('../../../strata/src/index.js').Strata} strata
   * @param {{ config: object, root: HTMLElement }} options
   */
  constructor (strata, { config, root }) {
    this.strata = strata
    this.config = config
    this.root = root
    /** Set by <strata-canvas> when it mounts. @type {any} */
    this.canvas = null
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  /** Selected graph ids (model ids plus boundary ports, ghosts, ...). */
  get selection () { return [...this.#selection] }

  /** Model ids among the selection. */
  get selectedModelIds () { return this.#selection.filter(id => !/^(frame|bp|map|ghost|ghostedge):/.test(id)) }

  /** @param {string[]} ids */
  select (ids) {
    const next = [...new Set(ids)]
    if (next.length === this.#selection.length && next.every((id, i) => id === this.#selection[i])) return
    this.#selection = next
    this.emit('selection', { ids: this.selection })
  }

  /**
   * @param {string} event
   * @param {Function} fn
   * @returns {() => void}
   */
  on (event, fn) {
    let set = this.#listeners.get(event)
    if (!set) this.#listeners.set(event, (set = new Set()))
    set.add(fn)
    return () => set.delete(fn)
  }

  /** @param {string} event @param {unknown} [data] */
  emit (event, data) {
    for (const fn of [...(this.#listeners.get(event) ?? [])]) {
      try { fn(data) } catch (err) { queueMicrotask(() => { throw err }) }
    }
  }

  /** @param {Action} action */
  registerAction (action) {
    this.#actions.set(action.id, action)
  }

  /** @param {string} id */
  action (id) { return this.#actions.get(id) }

  /** Every action, with whether it can run now. @param {any} [context] */
  actions (context) {
    return [...this.#actions.values()].map(a => ({ ...a, available: a.enabled ? a.enabled(this, context) : true }))
  }

  /**
   * Runs an action if it is available; failures become notifications.
   * @param {string} id
   * @param {any} [context]
   */
  run (id, context) {
    const action = this.#actions.get(id)
    if (!action) return false
    if (action.enabled && !action.enabled(this, context)) return false
    try {
      action.run(this, context)
      return true
    } catch (err) {
      this.notify(/** @type {Error} */ (err).message, 'error')
      return false
    }
  }

  /**
   * @param {string} message
   * @param {'info'|'error'|'success'} [kind]
   */
  notify (message, kind = 'info') {
    this.emit('notify', { message, kind })
  }

  /** @param {'commands'|'add'|'find'} [mode] @param {any} [context] */
  openPalette (mode = 'commands', context) {
    this.emit('palette', { mode, context })
  }

  /** @param {{ id: string|null, kind: string|null, clientX: number, clientY: number, x: number, y: number }} target */
  openContextMenu (target) {
    this.emit('context-menu', target)
  }

  /** Asks the inspector to show something (and optionally focus a field). @param {string} id @param {{ focus?: string }} [options] */
  inspect (id, options = {}) {
    this.emit('inspect', { id, ...options })
  }
}
