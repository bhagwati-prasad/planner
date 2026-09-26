/**
 * <strata-canvas>: the design surface (spec §9). Hosts strata-graph and its minimap, the
 * breadcrumb and the page (view) tabs, and runs drill-down transitions: entering a composite
 * zooms into it before the child system appears; going up zooms back out of it
 * (IcePanel-style). Each system remembers its own viewport.
 */
import { create, createMinimap, fitTransform } from '../../../graph/src/index.js'
import { toGraphData, applyIntent, parseId } from '../adapter.js'
import { StrataElement, h, fill, define } from './base.js'

const TRANSITION_MS = 320

export class StrataCanvas extends StrataElement {
  static css = `
:host { position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column; }
.content { display: contents; }
header { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--st-line); background: var(--st-panel); min-height: 34px; }
nav ol { list-style: none; display: flex; flex-wrap: wrap; gap: 2px; margin: 0; padding: 0; align-items: center; }
nav li { display: flex; align-items: center; }
nav li + li::before { content: '›'; color: var(--st-muted); margin: 0 4px; }
nav button { border: 0; padding: 2px 6px; font-weight: 500; }
nav button[aria-current="page"] { font-weight: 700; cursor: default; }
.badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: var(--st-warn-soft); color: var(--st-warn); }
.pages { margin-left: auto; display: flex; gap: 2px; align-items: center; }
.pages button { border-radius: var(--st-radius) var(--st-radius) 0 0; border-bottom-color: transparent; padding: 2px 10px; }
.pages button[aria-selected="true"] { background: var(--st-bg); border-color: var(--st-line); font-weight: 600; }
.stage { position: relative; flex: 1; min-height: 0; }
.graph { position: absolute; inset: 0; }
.minimap { position: absolute; right: 10px; bottom: 10px; border: 1px solid var(--st-line); border-radius: var(--st-radius); overflow: hidden; box-shadow: var(--st-shadow); }
.zoom { position: absolute; left: 10px; bottom: 10px; font-size: 11px; color: var(--st-muted); background: var(--st-panel); border: 1px solid var(--st-line); border-radius: var(--st-radius); padding: 1px 6px; }
.hint { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; color: var(--st-muted); text-align: center; }
.hint p { max-width: 360px; line-height: 1.5; }
`

  /** @type {import('../../../graph/src/index.js').Graph|null} */
  graph = null
  #minimap = null
  /** @type {string|null} */
  #viewId = null
  #key = null
  /** @type {Map<string, {x: number, y: number, k: number}>} */
  #transforms = new Map()
  #transitioning = false
  #crumbs
  #pages
  #stage
  #graphHost
  #zoom
  #hint

  constructor () {
    super()
    this.#crumbs = h('nav', { 'aria-label': 'System path' }, h('ol'))
    this.#pages = h('div', { class: 'pages', role: 'tablist', 'aria-label': 'Pages' })
    this.#graphHost = h('div', { class: 'graph' })
    this.#zoom = h('div', { class: 'zoom', 'aria-live': 'polite' })
    this.#hint = h('div', { class: 'hint', hidden: true })
    this.#stage = h('div', { class: 'stage' }, this.#graphHost, h('div', { class: 'minimap' }), this.#zoom, this.#hint)
    this.content.append(h('header', null, this.#crumbs, this.#pages), this.#stage)
  }

  subscribe (strata, shell) {
    shell.canvas = this
    if (!this.graph) {
      this.graph = create(this.#graphHost, {
        grid: 10,
        theme: shell.theme ?? 'light',
        deleteKeys: ['Delete'],
        ariaLabel: 'Architecture diagram',
        canConnect: (s, t) => this.#canConnect(s, t)
      })
      this.#minimap = createMinimap(this.graph, /** @type {HTMLElement} */ (this.#stage.querySelector('.minimap')), { width: 200, height: 130 })
      this.graph.on('intent', intent => this.intent(intent))
      this.graph.on('transform', () => this.#showZoom())
    }
    return [
      strata.on('change', () => this.invalidate()),
      strata.on('navigate', () => this.#navigated()),
      strata.on('project', () => { this.#key = null; this.update() }),
      shell.on('selection', ({ ids }) => this.graph?.select(ids)),
      shell.on('theme', theme => { this.graph?.setTheme(theme); this.#minimap?.refresh() }),
      shell.on('highlight', ({ ids }) => {
        if (ids?.length) this.graph?.setOverlay('highlight', { ids })
        else this.graph?.clearOverlay('highlight')
      })
    ]
  }

  /** Applies a graph intent through the adapter; errors become notifications. @param {any} intent */
  intent (intent) {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {import('./shell.js').Shell} */ (this.shell)
    const system = strata.project?.nav.current
    if (!system) return
    let result
    try {
      result = applyIntent(intent, { strata, system, viewId: this.#viewId })
    } catch (err) {
      shell.notify(/** @type {Error} */ (err).message, 'error')
      this.update()
      return
    }
    if (result.select) shell.select(result.select)
    if (result.enter) this.enter(result.enter)
    if (result.inspect) shell.inspect(result.inspect)
    if (result.quickAdd) shell.openPalette('add', { source: result.quickAdd.source, at: { x: result.quickAdd.x, y: result.quickAdd.y } })
    if (result.contextMenu) shell.openContextMenu(result.contextMenu)
  }

  /** Drills into a composite node. @param {string} nodeId */
  enter (nodeId) {
    const strata = /** @type {any} */ (this.strata)
    strata.nav.enter(strata.project.node(nodeId))
  }

  /** Where pasted or added things go: the middle of the view. */
  freeSpot () {
    if (!this.graph) return undefined
    const { width, height } = this.graph.size
    const t = this.graph.transform
    return { x: Math.round(((width / 2 - t.x) / t.k - 80) / 10) * 10, y: Math.round(((height / 2 - t.y) / t.k - 32) / 10) * 10 }
  }

  /** Adds a page (view) to the current system and shows it. */
  newPage () {
    const strata = /** @type {any} */ (this.strata)
    const system = strata.project.nav.current
    const count = system.views().length
    this.#viewId = strata.dispatch({ type: 'view.create', payload: { systemId: system.id, name: `Page ${count + 1}` } })
    this.update()
  }

  /** @param {'svg'|'png'} format */
  async download (format) {
    if (!this.graph) return
    const name = `${(/** @type {any} */ (this.strata)).project?.nav.current.name ?? 'diagram'}.${format}`.replace(/[^\w.-]+/g, '-')
    const blob = format === 'svg'
      ? new Blob([this.graph.exportSVG()], { type: 'image/svg+xml' })
      : await this.graph.exportPNG({ scale: 2 })
    const a = h('a', { href: URL.createObjectURL(blob), download: name })
    a.click()
    setTimeout(() => URL.revokeObjectURL(/** @type {HTMLAnchorElement} */ (a).href), 2000)
  }

  update () {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {import('./shell.js').Shell} */ (this.shell)
    if (!this.graph || this.#transitioning) return
    const project = strata.project
    if (!project) {
      this.graph.setData({})
      this.#renderCrumbs(null)
      fill(this.#pages)
      this.#showHint('No project is open.')
      return
    }
    const system = project.nav.current
    const key = `${system.id}|${system.via?.id ?? ''}`
    if (!system.views().some(v => v.id === this.#viewId)) this.#viewId = null
    const { data, viewId } = toGraphData(system, { viewId: this.#viewId ?? undefined })
    this.#viewId = viewId
    this.graph.setOptions({ readOnly: system.readOnly })
    this.graph.setData(data)
    this.graph.select(shell.selection)
    if (this.graph.selection.length !== shell.selection.length) shell.select(this.graph.selection)

    // Nodes with errors get a badge (spec §6: badges show where problems sit).
    const errors = {}
    for (const p of project.problems()) {
      if (p.severity === 'error' && p.kind === 'node') errors[p.id] = (errors[p.id] ?? 0) + 1
    }
    this.graph.setOverlay('badges', { values: errors })

    this.#renderCrumbs(project)
    this.#renderPages(system)
    this.#showHint((data.nodes ?? []).some(n => parseId(n.id).kind === 'model')
      ? null
      : system.readOnly
        ? 'This system is empty.'
        : 'Drag a component here from the library, or press Ctrl+K and search for “Add a component”.')
    if (key !== this.#key) {
      this.#key = key
      const saved = this.#transforms.get(key)
      if (saved) this.graph.setTransform(saved)
      else this.graph.fit({ maxScale: 1 })
    }
    this.#showZoom()
  }

  async #navigated () {
    const strata = /** @type {any} */ (this.strata)
    const shell = /** @type {import('./shell.js').Shell} */ (this.shell)
    const graph = this.graph
    // A running transition renders whatever the path is when it ends.
    if (!graph || this.#transitioning) return
    if (this.#key) this.#transforms.set(this.#key, graph.transform)
    const previousKey = this.#key
    const path = strata.nav.toJSON()
    const current = path.at(-1)
    const parent = path.at(-2)
    const animate = !shell.reducedMotion
    shell.select([])
    // Entering: the composite is still on screen; zoom into it before showing its system.
    if (animate && current?.viaNodeId && previousKey?.startsWith(`${parent?.systemId}|`) && graph.bounds([current.viaNodeId])) {
      this.#transitioning = true
      graph.zoomTo([current.viaNodeId], { animate: true, padding: 0, maxScale: 8 })
      await delay(TRANSITION_MS)
      this.#transitioning = false
      this.update()
      return
    }
    // Going up: show the parent zoomed into the composite we left, then zoom out.
    const left = previousKey?.split('|')[1]
    this.update()
    if (animate && left && graph.bounds([left]) && this.#key !== previousKey) {
      const target = graph.transform
      const into = fitTransform(graph.bounds([left]), graph.size, { padding: 0, maxScale: 8 })
      graph.setTransform(into)
      graph.setTransform(target, { animate: true })
    }
  }

  #renderCrumbs (project) {
    const ol = /** @type {HTMLElement} */ (this.#crumbs.firstElementChild)
    if (!project) { fill(ol); return }
    const strata = /** @type {any} */ (this.strata)
    const path = project.nav.path
    const depth = path.length - 1
    fill(ol, ...path.map((system, i) => h('li', null,
      h('button', {
        'aria-current': i === depth ? 'page' : null,
        title: i === depth ? system.name : `Go up to ${system.name}`,
        onclick: () => { for (let n = depth; n > i; n--) strata.nav.up() }
      }, system.name),
      i === depth && system.readOnly ? h('span', { class: 'badge', title: 'Placed by reference: edit the source system to change it' }, 'read-only') : null
    )))
  }

  #renderPages (system) {
    const views = system.views()
    fill(this.#pages,
      ...views.map(v => h('button', {
        role: 'tab',
        'aria-selected': String(v.id === this.#viewId),
        onclick: () => { this.#viewId = v.id; this.update() }
      }, v.name)),
      system.readOnly ? null : h('button', { class: 'ghost', title: 'New page', 'aria-label': 'New page', onclick: () => this.newPage() }, '+')
    )
  }

  #showZoom () {
    if (this.graph) this.#zoom.textContent = `${Math.round(this.graph.transform.k * 100)}%`
  }

  /** @param {string|null} text */
  #showHint (text) {
    this.#hint.hidden = !text
    fill(this.#hint, text ? h('p', null, text) : '')
  }

  /**
   * Whether a connection gesture may end here: outputs to inputs, with a shared connection
   * type, and boundary ports by direction.
   */
  #canConnect (s, t) {
    if (s.node === t.node) return false
    if (s.spec?.direction === 'in' || t.spec?.direction === 'out') return false
    const strata = /** @type {any} */ (this.strata)
    const accepts = end => {
      if (parseId(end.node).kind !== 'model' || !end.port) return []
      try { return strata.project.node(end.node).port(end.port).accepts } catch { return [] }
    }
    const a = accepts(s)
    const b = accepts(t)
    return !a.length || !b.length || a.some(x => b.includes(x))
  }
}

/** @param {number} ms */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

define('strata-canvas', StrataCanvas)
