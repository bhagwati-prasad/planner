/**
 * <strata-library>: component and system library with search and drag-to-place (spec §9).
 * Drag an item onto the canvas, or click it to add it in the middle of the view.
 */
import { StrataElement, h, fill, define } from './base.js'

const DROP_TYPE = 'application/x-strata'

export class StrataLibrary extends StrataElement {
  static css = `
:host { display: flex; flex-direction: column; min-height: 0; }
.content { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.search { padding: 8px; border-bottom: 1px solid var(--st-line); }
.search input { width: 100%; }
.list { overflow: auto; padding: 0 8px 8px; flex: 1; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
li button { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 1px; cursor: grab; background: var(--st-field); }
li button small { color: var(--st-muted); font-size: 11px; }
li .actions { display: flex; gap: 4px; }
li .actions button { width: auto; cursor: pointer; background: transparent; }
.system { display: flex; gap: 4px; }
.system > button:first-child { flex: 1; }
`

  #query = ''
  #list
  #search

  constructor () {
    super()
    this.#search = h('input', {
      type: 'search',
      placeholder: 'Search components and systems',
      'aria-label': 'Search the library',
      oninput: e => { this.#query = e.target.value.trim().toLowerCase(); this.update() }
    })
    this.#list = h('div', { class: 'list' })
    this.content.append(h('div', { class: 'search' }, this.#search), this.#list)
  }

  subscribe (strata) {
    return [strata.on('change', () => this.invalidate()), strata.on('project', () => this.invalidate()), strata.on('navigate', () => this.invalidate())]
  }

  update () {
    const strata = /** @type {any} */ (this.strata)
    const match = (...texts) => !this.#query || texts.some(t => String(t ?? '').toLowerCase().includes(this.#query))
    const components = strata.components.list().filter(c => !c.abstract && match(c.name, c.id, c.category))
    const groups = new Map()
    for (const c of components) {
      const key = c.category || 'Other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }
    const project = strata.project
    const writable = !!project && !project.nav.current.readOnly
    const systems = project ? project.library().filter(s => match(s.name)) : []
    const sections = []
    for (const [category, items] of [...groups].sort((a, b) => Number(a[0] === 'Base') - Number(b[0] === 'Base') || a[0].localeCompare(b[0]))) {
      sections.push(h('h2', null, category), h('ul', null, items.map(c => h('li', null, h('button', {
        draggable: 'true',
        disabled: !writable,
        title: `Drag onto the canvas, or click to add ${c.name}`,
        ondragstart: e => {
          e.dataTransfer.setData(DROP_TYPE, JSON.stringify({ typeRef: c.id }))
          e.dataTransfer.effectAllowed = 'copy'
        },
        onclick: () => this.#add(c.id)
      }, c.name, h('small', null, `${c.id}@${c.version}`))))))
    }
    if (project) {
      sections.push(h('h2', null, 'Systems'))
      sections.push(systems.length
        ? h('ul', null, systems.map(s => h('li', null, h('div', { class: 'system' },
          h('button', {
            draggable: 'true',
            disabled: !writable,
            title: 'Drag or click to place by reference (linked, read-only where placed)',
            ondragstart: e => {
              e.dataTransfer.setData(DROP_TYPE, JSON.stringify({ systemRef: s.id, placement: 'reference' }))
              e.dataTransfer.effectAllowed = 'copy'
            },
            onclick: () => this.#place(s.id, 'reference')
          }, s.name, h('small', null, `${s.nodes().length} nodes · reference`)),
          h('button', { title: `Place an editable copy of ${s.name}`, 'aria-label': `Place a copy of ${s.name}`, disabled: !writable, onclick: () => this.#place(s.id, 'value') }, 'Copy'),
          h('button', { title: `Open ${s.name} to edit it`, 'aria-label': `Open ${s.name}`, onclick: () => strata.nav.enter(s) }, 'Open')
        ))))
        : h('p', { class: 'muted' }, this.#query ? 'No matching systems.' : 'No library systems yet. Extract a selection or use “New library system”.'))
      sections.push(h('h2', null, 'Patterns'), h('p', { class: 'muted' }, 'Saved patterns arrive in R1.'))
    }
    if (!components.length && !systems.length && this.#query) sections.unshift(h('p', { class: 'empty' }, `Nothing matches “${this.#query}”.`))
    fill(this.#list, ...sections)
  }

  /** @param {string} typeRef */
  #add (typeRef) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    this.attempt(() => {
      const node = strata.project.nav.current.add(typeRef, { at: shell.canvas?.freeSpot() })
      shell.select([node.id])
    })
  }

  /** @param {string} systemId @param {'reference'|'value'} placement */
  #place (systemId, placement) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {any} */ (this.shell)
    this.attempt(() => {
      const node = strata.project.nav.current.place(systemId, { placement, at: shell.canvas?.freeSpot() })
      shell.select([node.id])
    })
  }
}

define('strata-library', StrataLibrary)
