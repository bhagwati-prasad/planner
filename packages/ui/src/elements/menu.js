/**
 * <strata-context-menu> and <strata-toolbar>.
 */
import { StrataElement, h, fill, define } from './base.js'
import { displayShortcut } from './actions.js'
import { parseId } from '../adapter.js'

/** Actions offered for each kind of target, in order; '-' is a separator. */
const MENU = {
  node: ['nav.enter', 'edit.rename', '-', 'edit.copy', 'edit.duplicate', 'edit.delete', '-', 'structure.extract', 'structure.inline', 'structure.detach', '-', 'arrange.left', 'arrange.top', 'view.zoomSelection'],
  edge: ['edit.rename', 'edit.delete'],
  frame: ['nav.up', 'view.fit'],
  background: ['edit.paste', 'palette.add', 'structure.newSystem', '-', 'edit.selectAll', 'view.fit', 'nav.up']
}

export class StrataContextMenu extends StrataElement {
  static css = `
:host { position: fixed; inset: 0; z-index: 40; display: none; }
:host([open]) { display: block; }
.catcher { position: absolute; inset: 0; }
[role="menu"] { position: absolute; min-width: 220px; background: var(--st-panel); border: 1px solid var(--st-line); border-radius: 8px; box-shadow: var(--st-shadow-lg); padding: 4px; }
[role="menuitem"] { display: flex; gap: 12px; justify-content: space-between; width: 100%; text-align: left; border: 0; padding: 5px 10px; }
[role="menuitem"]:focus { background: var(--st-accent-soft); outline: none; }
[role="menuitem"]:disabled { opacity: 0.4; }
hr { border: 0; border-top: 1px solid var(--st-line); margin: 4px 0; }
kbd { font: var(--st-mono); font-size: 11px; color: var(--st-muted); }
`

  #menu
  #returnFocus = null

  constructor () {
    super()
    this.#menu = h('div', { role: 'menu', onkeydown: e => this.#key(e) })
    this.content.append(h('div', { class: 'catcher', onpointerdown: () => this.close(), oncontextmenu: e => { e.preventDefault(); this.close() } }), this.#menu)
  }

  subscribe (strata, shell) {
    return [shell.on('context-menu', target => this.open(target))]
  }

  open (target) {
    const shell = /** @type {any} */ (this.shell)
    const parsed = target.id ? parseId(target.id) : null
    // Right-clicking something outside the selection selects it first.
    if (target.id && !shell.selection.includes(target.id)) shell.select([target.id])
    const kind = !target.id ? 'background' : parsed?.kind === 'frame' ? 'frame' : target.kind === 'edge' || parsed?.kind === 'map' ? 'edge' : 'node'
    const context = { at: target.id ? undefined : { x: target.x, y: target.y } }
    const actions = new Map(shell.actions(context).map(a => [a.id, a]))
    const items = MENU[kind].map(id => {
      if (id === '-') return h('hr')
      const a = actions.get(id)
      if (!a) return null
      return h('button', {
        role: 'menuitem',
        tabindex: '-1',
        disabled: !a.available,
        onclick: () => { this.close(); shell.run(a.id, context) }
      }, h('span', null, a.title), a.shortcut ? h('kbd', null, displayShortcut(a.shortcut)) : null)
    }).filter(Boolean)
    // Drop separators at the edges or next to each other.
    const cleaned = items.filter((el, i, all) => el.tagName !== 'HR' || (i > 0 && i < all.length - 1 && all[i - 1].tagName !== 'HR'))
    fill(this.#menu, ...cleaned)
    this.#returnFocus = /** @type {any} */ (document.activeElement)
    this.setAttribute('open', '')
    const width = 240
    const height = cleaned.length * 30
    this.#menu.style.left = `${Math.min(target.clientX, window.innerWidth - width - 8)}px`
    this.#menu.style.top = `${Math.min(target.clientY, window.innerHeight - height - 8)}px`
    requestAnimationFrame(() => /** @type {HTMLElement|null} */ (this.#menu.querySelector('[role="menuitem"]:not(:disabled)'))?.focus())
  }

  close () {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.#returnFocus?.focus?.()
  }

  #key (e) {
    const items = /** @type {HTMLElement[]} */ ([...this.#menu.querySelectorAll('[role="menuitem"]:not(:disabled)')])
    const i = items.indexOf(/** @type {HTMLElement} */ (this.shadowRoot?.activeElement))
    if (e.key === 'Escape') { e.preventDefault(); this.close() }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
  }
}

/** Mode tabs from spec §9; only Design exists in R0. */
const MODES = [
  { id: 'design', title: 'Design' },
  { id: 'simulate', title: 'Simulate', release: 'R1' },
  { id: 'debug', title: 'Debug', release: 'R1' },
  { id: 'test', title: 'Test', release: 'R1' },
  { id: 'docs', title: 'Docs', release: 'R2' },
  { id: 'plan', title: 'Plan', release: 'R2' }
]

export class StrataToolbar extends StrataElement {
  static css = `
:host { border-bottom: 1px solid var(--st-line); background: var(--st-panel); }
.content { display: flex; align-items: center; gap: 12px; padding: 6px 10px; flex-wrap: wrap; }
.brand { font-weight: 800; letter-spacing: 0.02em; }
.project { font-weight: 600; }
[role="tablist"] { display: flex; gap: 2px; }
[role="tab"] { border-color: transparent; }
[role="tab"][aria-selected="true"] { background: var(--st-accent-soft); border-color: var(--st-accent); font-weight: 600; }
.spacer { flex: 1; }
.group { display: flex; gap: 4px; }
`

  subscribe (strata, shell) {
    return [
      ...['change', 'history', 'project', 'navigate'].map(e => strata.on(e, () => this.invalidate())),
      shell.on('selection', () => this.invalidate()),
      shell.on('theme', () => this.invalidate())
    ]
  }

  update () {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    const project = strata.project
    const button = (id, label, attrs = {}) => {
      const a = shell.action(id)
      const available = a && (!a.enabled || a.enabled(shell))
      return h('button', { title: a ? `${a.title}${a.shortcut ? ` (${displayShortcut(a.shortcut)})` : ''}` : label, disabled: !available, onclick: () => shell.run(id), ...attrs }, label)
    }
    fill(this.content,
      h('span', { class: 'brand' }, 'Strata'),
      h('span', { class: 'project', title: 'Project' }, project ? project.name : 'No project'),
      h('div', { role: 'tablist', 'aria-label': 'Mode' }, MODES.map(m => h('button', {
        role: 'tab',
        'aria-selected': String(m.id === 'design'),
        title: m.release ? `${m.title} arrives in ${m.release}` : m.title,
        onclick: () => { if (m.release) shell.notify(`${m.title} mode arrives in ${m.release}.`) }
      }, m.title))),
      h('span', { class: 'spacer' }),
      h('div', { class: 'group' }, button('edit.undo', 'Undo'), button('edit.redo', 'Redo')),
      h('div', { class: 'group' }, button('structure.extract', 'Extract'), button('nav.up', 'Up')),
      h('div', { class: 'group' },
        button('palette.commands', `Commands ${displayShortcut('Ctrl+K')}`),
        h('button', { onclick: () => shell.emit('toggle-theme'), 'aria-pressed': String(shell.theme === 'dark'), title: 'Toggle dark theme' }, shell.theme === 'dark' ? 'Light' : 'Dark'),
        button('help.shortcuts', '?', { 'aria-label': 'Keyboard shortcuts' })
      )
    )
  }
}

define('strata-context-menu', StrataContextMenu)
define('strata-toolbar', StrataToolbar)
