/**
 * <strata-palette>: the command palette (spec §9, Ctrl+K). Three modes:
 *   commands  every shell action, with its shortcut;
 *   add       a component or library system to add (after dragging a connection into empty
 *             space, the new node is also connected);
 *   find      a node anywhere in the project: navigates to it and selects it (canvas search).
 */
import { StrataElement, h, fill, define } from './base.js'
import { displayShortcut } from './actions.js'

/**
 * Subsequence match score (higher is better), or -1 when `query` is not a subsequence.
 * @param {string} query
 * @param {string} text
 */
export function fuzzyScore (query, text) {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const at = t.indexOf(q)
  if (at >= 0) return 1000 - at * 2 - (t.length - q.length) * 0.1
  let score = 0
  let ti = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return -1
    streak = found === ti ? streak + 1 : 0
    score += 10 + streak * 5 - (found - ti)
    ti = found + 1
  }
  return score
}

export class StrataPalette extends StrataElement {
  static css = `
:host { position: fixed; inset: 0; z-index: 50; display: none; }
:host([open]) { display: block; }
.backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.25); }
.dialog { position: absolute; top: 12vh; left: 50%; transform: translateX(-50%); width: min(560px, 92vw); background: var(--st-panel); border: 1px solid var(--st-line); border-radius: 10px; box-shadow: var(--st-shadow-lg); display: flex; flex-direction: column; max-height: 70vh; }
input { margin: 10px; padding: 8px 10px; font-size: 15px; }
ul { list-style: none; margin: 0; padding: 0 6px 6px; overflow: auto; }
li { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
li[aria-selected="true"] { background: var(--st-accent-soft); }
li[aria-disabled="true"] { opacity: 0.45; cursor: default; }
li .group { color: var(--st-muted); font-size: 11px; min-width: 70px; }
li .title { flex: 1; }
li kbd { font: var(--st-mono); font-size: 11px; color: var(--st-muted); border: 1px solid var(--st-line); border-radius: 4px; padding: 0 4px; }
.hint { color: var(--st-muted); font-size: 12px; padding: 0 16px 10px; }
`

  #mode = 'commands'
  #context = null
  #items = []
  #index = 0
  /** @type {HTMLInputElement} */
  #input
  #list
  #hint
  #returnFocus = null

  constructor () {
    super()
    this.#input = /** @type {HTMLInputElement} */ (h('input', {
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': 'results',
      'aria-autocomplete': 'list',
      oninput: () => { this.#index = 0; this.#renderList() },
      onkeydown: e => this.#key(e)
    }))
    this.#list = h('ul', { id: 'results', role: 'listbox' })
    this.#hint = h('p', { class: 'hint' })
    this.content.append(
      h('div', { class: 'backdrop', onclick: () => this.close() }),
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, this.#input, this.#list, this.#hint)
    )
  }

  subscribe (strata, shell) {
    return [shell.on('palette', ({ mode, context }) => this.open(mode, context))]
  }

  /** @param {'commands'|'add'|'find'} mode @param {any} [context] */
  open (mode = 'commands', context = null) {
    this.#mode = mode
    this.#context = context
    this.#index = 0
    this.#returnFocus = /** @type {any} */ (document.activeElement)
    this.#input.value = ''
    this.#input.setAttribute('placeholder', { commands: 'Type a command…', add: 'Add a component or system…', find: 'Find a node by name…' }[mode])
    this.#input.setAttribute('aria-label', { commands: 'Command', add: 'Component to add', find: 'Node to find' }[mode])
    this.#hint.textContent = mode === 'commands' ? 'Enter runs · Esc closes' : mode === 'add' ? (context?.source ? 'The new node is connected to the port you dragged from.' : 'Adds it in the middle of the view.') : 'Enter goes to the node.'
    this.setAttribute('open', '')
    this.#renderList()
    requestAnimationFrame(() => this.#input.focus())
  }

  close () {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.#returnFocus?.focus?.()
  }

  #candidates () {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    const project = strata.project
    if (this.#mode === 'commands') {
      return shell.actions().filter(a => a.id !== 'palette.commands').map(a => ({
        key: a.id,
        group: a.group ?? '',
        title: a.title,
        shortcut: a.shortcut,
        disabled: !a.available,
        run: () => shell.run(a.id)
      }))
    }
    if (this.#mode === 'add') {
      if (!project) return []
      const components = strata.components.list({ kind: 'component' }).filter(c => !c.abstract).map(c => ({
        key: c.id, group: c.category || 'Component', title: c.name, detail: c.id, run: () => this.#add({ typeRef: c.id })
      }))
      const systems = project.library().map(s => ({
        key: s.id, group: 'System', title: s.name, detail: 'reference', run: () => this.#add({ systemRef: s.id })
      }))
      return [...components, ...systems]
    }
    if (!project) return []
    return project.nodes().map(n => ({
      key: n.id, group: n.system.name, title: n.name, detail: n.type ?? 'system', run: () => this.#reveal(n)
    }))
  }

  #renderList () {
    const q = this.#input.value.trim()
    const scored = this.#candidates()
      .map(item => ({ item, score: Math.max(fuzzyScore(q, item.title), fuzzyScore(q, `${item.group} ${item.title}`) - 50) }))
      .filter(x => x.score >= 0)
    scored.sort((a, b) => Number(a.item.disabled ?? false) - Number(b.item.disabled ?? false) || b.score - a.score || a.item.title.localeCompare(b.item.title))
    this.#items = scored.slice(0, 50).map(x => x.item)
    if (this.#index >= this.#items.length) this.#index = Math.max(0, this.#items.length - 1)
    fill(this.#list, ...(this.#items.length ? this.#items.map((item, i) => h('li', {
      id: `opt-${i}`,
      role: 'option',
      'aria-selected': String(i === this.#index),
      'aria-disabled': item.disabled ? 'true' : null,
      onmousemove: () => { if (this.#index !== i) { this.#index = i; this.#renderList() } },
      onclick: () => this.#choose(i)
    }, h('span', { class: 'group' }, item.group), h('span', { class: 'title' }, item.title), item.detail ? h('span', { class: 'muted' }, item.detail) : null, item.shortcut ? h('kbd', null, displayShortcut(item.shortcut)) : null)) : [h('li', { 'aria-disabled': 'true' }, 'No matches')]))
    this.#input.setAttribute('aria-activedescendant', this.#items.length ? `opt-${this.#index}` : '')
    this.#list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }

  #key (e) {
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.#index = Math.min(this.#items.length - 1, this.#index + 1); this.#renderList(); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.#index = Math.max(0, this.#index - 1); this.#renderList(); return }
    if (e.key === 'Enter') { e.preventDefault(); this.#choose(this.#index) }
  }

  #choose (i) {
    const item = this.#items[i]
    if (!item || item.disabled) return
    this.close()
    item.run()
  }

  /**
   * Adds a component (and connects it when the palette opened from a connection drag).
   * @param {{ typeRef?: string, systemRef?: string }} what
   */
  #add ({ typeRef, systemRef }) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    const context = this.#context
    this.attempt(() => {
      const project = strata.project
      const system = project.nav.current
      const at = context?.at ? { x: Math.round(context.at.x / 10) * 10, y: Math.round((context.at.y - 32) / 10) * 10 } : shell.canvas?.freeSpot()
      project.transaction(() => {
        const node = typeRef ? system.add(typeRef, { at }) : system.place(systemRef, { at })
        if (context?.source?.port) {
          try {
            system.connect(context.source.port, node)
          } catch (err) {
            shell.notify(`Added ${node.name}, but could not connect it: ${err.message}`, 'error')
          }
        }
        shell.select([node.id])
      }, { label: 'Add component' })
    })
  }

  /** Goes to a node's system and selects it. */
  #reveal (node) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    if (strata.project.nav.current.id !== node.system.id) strata.nav.enter(node.system)
    setTimeout(() => {
      shell.select([node.id])
      shell.canvas?.graph?.zoomTo([node.id], { animate: !shell.reducedMotion })
    }, shell.reducedMotion ? 0 : 400)
  }
}

define('strata-palette', StrataPalette)
