/**
 * The diagram (spec §9 "strata-graph API"). Renders graph data into SVG with D3, captures
 * gestures and emits intents. It never changes the data it was given: the host applies each
 * intent (in Strata, as commands on the bus) and calls `setData` again, so undo, history and
 * collaboration live in one place.
 *
 *   const g = strataGraph.create(hostEl, { grid: 10, theme: 'light' })
 *   g.setData({ nodes, edges, frames, annotations, layers })
 *   g.on('intent', intent => host.apply(intent))
 *   g.select(ids); g.zoomTo(ids, { animate: true }); g.fit()
 *   g.setOverlay('heatmap', { values, domain: [0, 1] })
 *   const svg = g.exportSVG(); const png = await g.exportPNG({ scale: 2 })
 *
 * Intents:
 *   { type: 'select', ids }
 *   { type: 'move', items: [{ id, kind, x, y, parent }] }
 *   { type: 'resize', id, kind, x, y, w, h }
 *   { type: 'connect', source: { node, port }, target: { node, port } }
 *   { type: 'connect-to-point', source: { node, port }, x, y }
 *   { type: 'reconnect', edge, end: 'source'|'target', to: { node, port } }
 *   { type: 'waypoints', edge, waypoints }
 *   { type: 'delete', ids }
 *   { type: 'open', id, kind }
 *   { type: 'context', id, kind, clientX, clientY, x, y }
 *   { type: 'drop', data, x, y }
 *
 * Other events: 'transform' (view moved), 'hover' ({ id, kind } or null), 'render' (stats).
 *
 * Gestures: drag a shape to move it (the selection moves together, frames bring their
 * contents; snapping to the grid and smart guides, Alt disables them), drag from a port to
 * connect, drag the background for a selection rectangle (Shift adds), Space+drag or the
 * middle button to pan, the wheel to scroll, Ctrl/⌘+wheel or a pinch to zoom.
 * Keyboard: Tab moves between shapes, Enter opens, Space selects, arrows move (Shift ×10),
 * Delete removes, Escape cancels or clears, Ctrl/⌘+A selects all, +/− zoom, 0 fits.
 */
import { GraphModel, DEFAULT_NODE_SIZE } from '../data.js'
import {
  boundaryAnchor,
  center,
  expand,
  portAnchors,
  rectFromPoints,
  intersects,
  snap,
  union,
} from '../geometry.js'
import { routeEdge } from '../routing.js'
import { SpatialIndex } from '../spatial.js'
import { snapMove } from '../snap.js'
import { align as alignItems, distribute as distributeItems } from '../arrange.js'
import { fitTransform, screenToWorld, visibleRect, zoomAt } from '../viewport.js'
import { wrapText } from '../text.js'
import { STYLESHEET, TOKENS, themeStyle, themeTokens } from '../theme.js'
import { BUILTIN_SHAPES } from './shapes.js'
import { SVG_NS, createMeasurer, sanitizeSvg, svgEl } from './svg.js'

const DEFAULTS = Object.freeze({
  grid: 10,
  snap: true,
  guides: true,
  /** @type {'straight'|'orthogonal'|'curved'} */
  routing: 'orthogonal',
  readOnly: false,
  minZoom: 0.05,
  maxZoom: 4,
  cullThreshold: 600,
  /** @type {'light'|'dark'|Record<string, string>} */
  theme: 'light',
  showGrid: true,
  portRadius: 4.5,
  /** @type {null | ((source: EndInfo, target: EndInfo) => boolean)} */
  canConnect: null,
  /** @type {string} */
  dropType: 'application/x-strata',
  /** @type {string} */
  ariaLabel: 'Diagram',
  /** Keys that request deleting the selection. @type {string[]} */
  deleteKeys: ['Delete', 'Backspace'],
})

const MOVABLE = new Set(['node', 'frame', 'annotation'])
const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
let instances = 0

/**
 * @typedef {{ node: string, port: string|null, spec?: import('../geometry.js').PortSpec }} EndInfo
 * @typedef {import('../geometry.js').Rect} Rect
 * @typedef {import('../viewport.js').Transform} Transform
 */

/**
 * @param {HTMLElement} host
 * @param {Partial<typeof DEFAULTS> & { d3?: any }} [options]
 */
export function create(host, options) {
  return new Graph(host, options)
}

export class Graph {
  #d3
  #host
  #opts
  #uid
  /** @type {Map<string, import('./shapes.js').ShapeDef>} */
  #shapes = new Map()
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map()
  #model = new GraphModel({})
  /** @type {Set<string>} */
  #selection = new Set()
  /** @type {Map<string, any>} */
  #overlays = new Map()
  /** @type {Transform} */
  #transform = { x: 0, y: 0, k: 1 }
  #size = { width: 0, height: 0 }
  #index = new SpatialIndex(256)
  #portIndex = new SpatialIndex(128)
  /** @type {Map<string, { key: string, route: import('../routing.js').Route }>} */
  #routes = new Map()
  /** @type {any} transient gesture state */
  #drag = null
  #spaceDown = false
  #focusedId = null
  #tokens
  #themeVersion = 0
  #measure
  #measureBold
  #fontSize = 12
  #iconCache = new Map()
  #renderedArea = null
  #raf = 0
  #stats = { nodes: 0, edges: 0, frames: 0, annotations: 0, culled: false, ms: 0 }
  #zoom
  #resizeObserver = null
  #cleanup = []
  /** @type {Record<string, any>} drag behaviours, created once */
  #behaviors = {}
  #portTargetShown = false
  /** @type {any} */ #svg
  /** @type {any} */ #root
  /** @type {Record<string, any>} */ #layers = {}
  /** @type {any} */ #marquee

  /**
   * @param {HTMLElement} host
   * @param {Partial<typeof DEFAULTS> & { d3?: any }} [options]
   */
  constructor(host, options = {}) {
    const { d3 = /** @type {any} */ (globalThis).d3, ...rest } = options
    if (!d3?.select || !d3.zoom || !d3.drag) {
      throw new Error(
        'strata-graph needs D3 (d3-selection, d3-zoom and d3-drag): load vendor/d3/d3.min.js first or pass { d3 }'
      )
    }
    if (!host || typeof host.appendChild !== 'function')
      throw new Error('strata-graph needs a host element')
    this.#d3 = d3
    this.#host = host
    this.#opts = { ...DEFAULTS, ...rest }
    this.#uid = `sg${++instances}`
    for (const [name, def] of Object.entries(BUILTIN_SHAPES)) this.#shapes.set(name, def)
    this.#applyThemeTokens()
    this.#buildDom()
    this.#setupZoom()
    this.#setupBackgroundDrag()
    this.#setupKeyboard()
    this.#setupDrop()
    this.#measureSize()
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => {
        this.#measureSize()
        this.#scheduleCull()
      })
      this.#resizeObserver.observe(this.#svg.node())
    }
    this.#render()
  }

  // ------------------------------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------------------------------

  /** The root <svg> element. */
  get element() {
    return this.#svg.node()
  }
  /** Current view transform: screen = world × k + (x, y). */
  get transform() {
    return { ...this.#transform }
  }
  /** Selected ids, in selection order. */
  get selection() {
    return [...this.#selection]
  }
  /** What the last render drew. */
  get stats() {
    return { ...this.#stats }
  }
  /** Problems found in the last `setData`. */
  get problems() {
    return [...this.#model.problems]
  }
  get options() {
    return { ...this.#opts }
  }
  /** Size of the view in pixels. */
  get size() {
    return { ...this.#size }
  }

  /**
   * Rectangles of the visible nodes, frames and annotations (for overviews such as the minimap).
   * @returns {{ id: string, kind: string, x: number, y: number, w: number, h: number, ghost: boolean }[]}
   */
  rects() {
    const m = this.#model
    const out = []
    for (const [kind, map] of /** @type {[string, Map<string, any>][]} */ ([
      ['frame', m.frames],
      ['node', m.nodes],
      ['annotation', m.annotations],
    ])) {
      for (const item of map.values()) {
        if (m.isHidden(item)) continue
        out.push({ id: item.id, kind, ...this.#itemRect(item.id), ghost: !!item.ghost })
      }
    }
    return out
  }

  /**
   * Adds or replaces a shape.
   * @param {string} name
   * @param {import('./shapes.js').ShapeDef} def
   */
  registerShape(name, def) {
    if (!def || typeof def.render !== 'function')
      throw new Error(`Shape '${name}' needs a render(sel, d, ctx) function`)
    this.#shapes.set(name, def)
    this.#themeVersion++
    this.#render()
    return this
  }

  /** @returns {string[]} */
  get shapes() {
    return [...this.#shapes.keys()]
  }

  /**
   * Replaces the graph data and re-renders (idempotent).
   * @param {import('../data.js').GraphData} data
   * @returns {import('../data.js').DataProblem[]} what could not be drawn
   */
  setData(data) {
    this.#model = new GraphModel(data ?? {}, {
      portsOf: n => this.#shapeOf(n).ports?.(n) ?? [],
      sizeOf: n => this.#shapeOf(n).size ?? DEFAULT_NODE_SIZE,
    })
    for (const id of this.#selection) if (!this.#model.kindOf(id)) this.#selection.delete(id)
    for (const id of this.#routes.keys()) if (!this.#model.edges.has(id)) this.#routes.delete(id)
    this.#rebuildIndexes()
    this.#render()
    return this.problems
  }

  /**
   * Shows a selection (the host decides what is selected; clicks only request it).
   * @param {Iterable<string>} ids
   */
  select(ids = []) {
    this.#selection = new Set([...ids].filter(id => this.#model.kindOf(id)))
    this.#render()
    return this
  }

  /**
   * @param {string} event 'intent' | 'transform' | 'hover' | 'render'
   * @param {Function} fn
   * @returns {() => void} unsubscribe
   */
  on(event, fn) {
    let set = this.#listeners.get(event)
    if (!set) this.#listeners.set(event, (set = new Set()))
    set.add(fn)
    return () => set.delete(fn)
  }

  /** @param {string} event @param {Function} fn */
  off(event, fn) {
    this.#listeners.get(event)?.delete(fn)
  }

  /**
   * Pans and zooms to show the given items.
   * @param {Iterable<string>} ids
   * @param {{ animate?: boolean, padding?: number, maxScale?: number }} [options]
   */
  zoomTo(ids, { animate = true, padding = 60, maxScale = 1.5 } = {}) {
    const bounds = this.#model.bounds(ids)
    if (!bounds) return this
    this.setTransform(
      fitTransform(bounds, this.#size, { padding, maxScale, minScale: this.#opts.minZoom }),
      { animate }
    )
    return this
  }

  /**
   * Fits everything in view.
   * @param {{ animate?: boolean, padding?: number, maxScale?: number }} [options]
   */
  fit({ animate = false, padding = 40, maxScale = 1 } = {}) {
    const bounds = this.#model.bounds()
    this.setTransform(
      bounds
        ? fitTransform(bounds, this.#size, { padding, maxScale, minScale: this.#opts.minZoom })
        : { x: 0, y: 0, k: 1 },
      { animate }
    )
    return this
  }

  /**
   * Zooms by a factor around the centre of the view.
   * @param {number} factor
   * @param {{ animate?: boolean }} [options]
   */
  zoomBy(factor, { animate = false } = {}) {
    const t = zoomAt(
      this.#transform,
      factor,
      { x: this.#size.width / 2, y: this.#size.height / 2 },
      { minScale: this.#opts.minZoom, maxScale: this.#opts.maxZoom }
    )
    return this.setTransform(t, { animate })
  }

  /**
   * @param {Transform} t
   * @param {{ animate?: boolean }} [options]
   */
  setTransform(t, { animate = false } = {}) {
    const d3 = this.#d3
    const z = d3.zoomIdentity.translate(t.x, t.y).scale(t.k)
    if (animate && !this.#reducedMotion() && typeof this.#svg.transition === 'function')
      this.#svg.transition().duration(350).call(this.#zoom.transform, z)
    else this.#svg.call(this.#zoom.transform, z)
    return this
  }

  /**
   * Pans so a world point is in the middle of the view, keeping the zoom.
   * @param {{ x: number, y: number }} point
   * @param {{ animate?: boolean }} [options]
   */
  centerOn(point, { animate = false } = {}) {
    const { k } = this.#transform
    return this.setTransform(
      { x: this.#size.width / 2 - point.x * k, y: this.#size.height / 2 - point.y * k, k },
      { animate }
    )
  }

  /**
   * Client (page) coordinates to world coordinates.
   * @param {{ x: number, y: number }} client
   */
  clientToWorld(client) {
    const box = this.#svg.node().getBoundingClientRect()
    return screenToWorld(this.#transform, { x: client.x - box.left, y: client.y - box.top })
  }

  /** @param {{ x: number, y: number }} world */
  worldToClient(world) {
    const box = this.#svg.node().getBoundingClientRect()
    return {
      x: world.x * this.#transform.k + this.#transform.x + box.left,
      y: world.y * this.#transform.k + this.#transform.y + box.top,
    }
  }

  /** Bounds of some items, or of everything. @param {Iterable<string>} [ids] */
  bounds(ids) {
    return this.#model.bounds(ids)
  }

  /**
   * Overlays for simulation and review (spec §9, §10):
   *   'heatmap'    { values: { id: number }, domain?: [min, max] }  tints nodes low → high
   *   'edge-width' { values: { id: number }, domain?: [min, max], range?: [min, max] }
   *   'badges'     { values: { id: number|string } }  counters on nodes (open comments, failures)
   *   'highlight'  { ids: string[] }  dims everything else
   * @param {string} name
   * @param {any} spec
   */
  setOverlay(name, spec) {
    this.#overlays.set(name, spec)
    this.#render()
    return this
  }

  /** @param {string} name */
  clearOverlay(name) {
    this.#overlays.delete(name)
    this.#render()
    return this
  }

  /**
   * Moves a request dot along an edge, from its source to its target or back with `reverse`
   * (ds §6 "Followed request"). The dot follows the edge's drawn path and is removed when it
   * arrives.
   * @param {string} edgeId
   * @param {{ durationMs?: number, reverse?: boolean }} [options]
   * @returns {Promise<void>} resolves when the dot arrives
   */
  animateToken(edgeId, { durationMs = 600, reverse = false } = {}) {
    const path = /** @type {SVGPathElement|null} */ (
      this.#layers.edges
        ?.node()
        .querySelector(`g.sg-edge[data-id="${cssEscape(edgeId)}"] path.sg-edge-path`)
    )
    if (!path) return Promise.reject(new Error(`Edge '${edgeId}' is not drawn`))
    const length = path.getTotalLength()
    const dot = this.#layers.tokens.append('circle').attr('class', 'sg-token').attr('r', 4)
    const place = (/** @type {number} */ t) => {
      const point = path.getPointAtLength(length * (reverse ? 1 - t : t))
      dot.attr('cx', point.x).attr('cy', point.y)
    }
    place(0)
    return new Promise(resolve => {
      const start = performance.now()
      const step = (/** @type {number} */ now) => {
        const t = Math.min(1, Math.max(0, (now - start) / durationMs))
        place(t)
        if (t < 1) requestAnimationFrame(step)
        else {
          dot.remove()
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  }

  /** @param {Partial<typeof DEFAULTS>} options */
  setOptions(options) {
    const { theme, ...rest } = options
    Object.assign(this.#opts, rest)
    if ('routing' in rest) this.#routes.clear()
    if ('grid' in rest || 'showGrid' in rest) this.#updateGrid()
    if ('minZoom' in rest || 'maxZoom' in rest)
      this.#zoom.scaleExtent([this.#opts.minZoom, this.#opts.maxZoom])
    if (theme !== undefined) this.setTheme(theme)
    this.#svg.classed('sg-readonly', !!this.#opts.readOnly).attr('aria-label', this.#opts.ariaLabel)
    this.#render()
    return this
  }

  /**
   * 'light', 'dark', or token overrides over light (see TOKENS).
   * @param {'light'|'dark'|Record<string, string>} theme
   */
  setTheme(theme) {
    this.#opts.theme = theme
    this.#applyThemeTokens()
    this.#svg.attr('style', this.#rootStyle())
    this.#themeVersion++
    this.#render()
    return this
  }

  /**
   * Requests aligning the selection (emits a move intent).
   * @param {'left'|'center'|'right'|'top'|'middle'|'bottom'} mode
   */
  align(mode) {
    this.#emitArrange(items => alignItems(items, mode))
    return this
  }

  /**
   * Requests spacing the selection evenly (emits a move intent).
   * @param {'horizontal'|'vertical'} axis
   */
  distribute(axis) {
    this.#emitArrange(items => distributeItems(items, axis))
    return this
  }

  /**
   * Moves keyboard focus to a node (and scrolls it into view).
   * @param {string} id
   */
  focus(id) {
    const el = this.#layers.nodes?.node().querySelector(`[data-id="${cssEscape(id)}"]`)
    if (el) el.focus({ preventScroll: true })
    else this.#svg.node().focus({ preventScroll: true })
  }

  /**
   * A standalone SVG document of the diagram (or of some items), with styles inlined.
   * @param {{ ids?: Iterable<string>, padding?: number, background?: boolean }} [options]
   * @returns {string}
   */
  exportSVG({ ids, padding = 24, background = true } = {}) {
    const only = ids ? new Set(ids) : null
    const bounds = this.#model.bounds(only ?? undefined) ?? { x: 0, y: 0, w: 1, h: 1 }
    const box = expand(bounds, padding)
    const doc = this.#svg.node().ownerDocument
    const svg = svgEl(
      'svg',
      {
        class: 'sg-root',
        width: Math.ceil(box.w),
        height: Math.ceil(box.h),
        viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
      },
      doc
    )
    const tokens = this.#tokens
    const vars = Object.fromEntries(
      Object.entries(TOKENS).map(([key, cssVar]) => [cssVar, tokens[key]])
    )
    const style = svgEl('style', {}, doc)
    style.textContent = STYLESHEET.replace(/var\((--sg-[a-z-]+)\)/g, (m, name) => vars[name] ?? m)
    svg.appendChild(style)
    svg.appendChild(this.#defs(doc, true))
    if (background)
      svg.appendChild(
        svgEl(
          'rect',
          { x: box.x, y: box.y, width: box.w, height: box.h, fill: tokens.background },
          doc
        )
      )
    const d3 = this.#d3
    const root = d3.select(svg).append('g').attr('class', 'sg-viewport')
    const layers = this.#makeLayers(root)
    this.#renderScene(layers, { interactive: false, only })
    let text = new XMLSerializer().serializeToString(svg)
    // Inline style attributes may still carry theme variables.
    text = text.replace(/var\((--sg-[a-z-]+)\)/g, (m, name) => vars[name] ?? m)
    return text
  }

  /**
   * The diagram as a PNG.
   * @param {{ scale?: number, ids?: Iterable<string>, padding?: number, background?: boolean }} [options]
   * @returns {Promise<Blob>}
   */
  async exportPNG({ scale = 2, ...svgOptions } = {}) {
    const svgText = this.exportSVG(svgOptions)
    const match = /width="(\d+)" height="(\d+)"/.exec(svgText)
    const width = Number(match?.[1] ?? 1)
    const height = Number(match?.[2] ?? 1)
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
    try {
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error('The diagram could not be rasterised'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(width * scale)
      canvas.height = Math.ceil(height * scale)
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      return await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
      )
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  /** Removes the diagram and its listeners. */
  destroy() {
    cancelAnimationFrame(this.#raf)
    this.#resizeObserver?.disconnect()
    for (const fn of this.#cleanup) fn()
    this.#svg.on('.zoom', null).on('.drag', null)
    this.#svg.remove()
    this.#listeners.clear()
  }

  // ------------------------------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------------------------------

  #applyThemeTokens() {
    this.#tokens = /** @type {Record<string, string>} */ (
      themeTokens(/** @type {any} */ (this.#opts.theme))
    )
    this.#fontSize = parseFloat(this.#tokens.fontSize) || 12
    this.#measure = createMeasurer(this.#tokens.fontFamily, this.#fontSize)
    this.#measureBold = createMeasurer(this.#tokens.fontFamily, this.#fontSize, '600')
  }

  #rootStyle() {
    return `${themeStyle(/** @type {any} */ (this.#opts.theme))} display: block; width: 100%; height: 100%;`
  }

  #buildDom() {
    const d3 = this.#d3
    const doc = this.#host.ownerDocument
    this.#svg = d3
      .select(this.#host)
      .append('svg')
      .attr('xmlns', SVG_NS)
      .attr('class', 'sg-root')
      .attr('tabindex', 0)
      .attr('role', 'application')
      .attr('aria-roledescription', 'diagram')
      .attr('aria-label', this.#opts.ariaLabel)
      .attr('style', this.#rootStyle())
      .classed('sg-readonly', !!this.#opts.readOnly)
    const svg = this.#svg.node()
    const style = svgEl('style', {}, doc)
    style.textContent = STYLESHEET
    svg.appendChild(style)
    svg.appendChild(this.#defs(doc, false))
    this.#svg
      .append('rect')
      .attr('class', 'sg-background')
      .attr('width', '100%')
      .attr('height', '100%')
    this.#root = this.#svg.append('g').attr('class', 'sg-viewport')
    this.#layers = this.#makeLayers(this.#root)
    // The dot grid lives in world space, in the first scene layer, over the visible area.
    for (const which of ['minor', 'major'])
      this.#layers.grid
        .append('rect')
        .attr('class', `sg-grid sg-grid-${which}`)
        .attr('fill', `url(#${this.#uid}-grid-${which})`)
        .attr('pointer-events', 'none')
    this.#marquee = this.#svg
      .append('rect')
      .attr('class', 'sg-marquee')
      .attr('visibility', 'hidden')
    this.#svg.on('pointerdown.focus', () => svg.focus({ preventScroll: true }))
    this.#svg.on('contextmenu', event => {
      if (event.target !== svg && !event.target.classList?.contains('sg-background')) return
      event.preventDefault()
      const world = this.clientToWorld({ x: event.clientX, y: event.clientY })
      this.#emitIntent({
        type: 'context',
        id: null,
        kind: null,
        clientX: event.clientX,
        clientY: event.clientY,
        x: world.x,
        y: world.y,
      })
    })
    this.#updateGrid()
  }

  /** Marker and pattern definitions (ids are unique per graph). */
  #defs(doc, forExport) {
    const defs = svgEl('defs', {}, doc)
    const marker = (id, cls) => {
      const m = svgEl(
        'marker',
        {
          id,
          viewBox: '0 0 10 10',
          refX: 9,
          refY: 5,
          markerWidth: 7,
          markerHeight: 7,
          orient: 'auto-start-reverse',
        },
        doc
      )
      m.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }, doc))
      defs.appendChild(m)
    }
    marker(`${this.#uid}-arrow`, 'sg-arrow')
    marker(`${this.#uid}-arrow-active`, 'sg-arrow sg-arrow-active')
    if (!forExport)
      for (const which of ['minor', 'major']) {
        const pattern = svgEl(
          'pattern',
          { id: `${this.#uid}-grid-${which}`, patternUnits: 'userSpaceOnUse' },
          doc
        )
        pattern.appendChild(svgEl('circle', { class: `sg-grid-dot-${which}` }, doc))
        defs.appendChild(pattern)
      }
    return defs
  }

  /**
   * The scene layers, in the fixed order of eng §12: grid, zones and frames, edges, nodes,
   * overlays, annotations, comment pins, handles. Frames and regions (zones) share a layer, and
   * so do the overlays: smart guides and simulation tokens.
   */
  #makeLayers(root) {
    const layer = (/** @type {string} */ name) =>
      root.append('g').attr('class', `sg-layer sg-layer-${name}`).attr('data-layer', name)
    const grid = layer('grid')
    const frames = layer('frames')
    const edges = layer('edges')
    const nodes = layer('nodes')
    const overlays = layer('overlays')
    const annotations = layer('annotations')
    const pins = layer('comment-pins')
    const handles = layer('handles')
    return {
      grid,
      frames: frames.append('g').attr('class', 'sg-frames'),
      regions: frames.append('g').attr('class', 'sg-regions'),
      edges,
      nodes,
      guides: overlays.append('g').attr('class', 'sg-guides'),
      tokens: overlays.append('g').attr('class', 'sg-tokens'),
      annotations,
      pins,
      handles,
    }
  }

  /**
   * The dot grid (design system §6): a dot every `grid` units and a stronger one every ten,
   * each the same size on screen at any zoom. Minor dots fade out below 50% zoom and are gone
   * at 25%; major dots go once they would sit closer than 8 px.
   */
  #updateGrid() {
    const { grid, showGrid } = this.#opts
    const g = grid || 10
    const { k } = this.#transform
    const layer = this.#layers.grid
    layer.attr('visibility', showGrid ? 'visible' : 'hidden')
    if (!showGrid) return
    const view = visibleRect(this.#transform, this.#size)
    const minorOpacity = Math.min(1, Math.max(0, (k - 0.25) / 0.25))
    const opacity = { minor: minorOpacity, major: g * 10 * k < 8 ? 0 : 1 }
    for (const [which, step, r] of /** @type {const} */ ([
      ['minor', g, 0.75],
      ['major', g * 10, 1.25],
    ])) {
      this.#svg
        .select(`#${this.#uid}-grid-${which}`)
        .attr('x', -step / 2)
        .attr('y', -step / 2)
        .attr('width', step)
        .attr('height', step)
        .select('circle')
        .attr('cx', step / 2)
        .attr('cy', step / 2)
        .attr('r', r / k)
      layer
        .select(`.sg-grid-${which}`)
        .attr('x', view.x)
        .attr('y', view.y)
        .attr('width', view.w)
        .attr('height', view.h)
        .attr('visibility', opacity[which] > 0 ? 'visible' : 'hidden')
        .style('opacity', opacity[which])
    }
  }

  /** True when the user asks for reduced motion (eng §12): views jump instead of animating. */
  #reducedMotion() {
    return !!this.#host.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches
  }

  #measureSize() {
    const box = this.#svg.node().getBoundingClientRect()
    this.#size = {
      width: box.width || this.#host.clientWidth || 800,
      height: box.height || this.#host.clientHeight || 600,
    }
  }

  #setupZoom() {
    const d3 = this.#d3
    const svg = this.#svg.node()
    this.#zoom = d3
      .zoom()
      .scaleExtent([this.#opts.minZoom, this.#opts.maxZoom])
      .filter(event => {
        if (event.type === 'wheel') return event.ctrlKey || event.metaKey
        if (event.type === 'dblclick') return false
        if (event.type.startsWith('touch')) return true
        return event.button === 1 || (event.button === 0 && this.#spaceDown)
      })
      .on('start', event => {
        if (event.sourceEvent?.type === 'mousedown') this.#svg.classed('sg-panning', true)
      })
      .on('zoom', event => {
        const { x, y, k } = event.transform
        this.#transform = { x, y, k }
        this.#root.attr('transform', `translate(${x},${y}) scale(${k})`)
        this.#updateGrid()
        this.#scheduleCull()
        this.#renderHandles()
        this.#emit('transform', { x, y, k })
      })
      .on('end', () => this.#svg.classed('sg-panning', false))
    this.#svg.call(this.#zoom).on('dblclick.zoom', null)
    const onWheel = event => {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      let dx = event.deltaX
      let dy = event.deltaY
      if (event.shiftKey && dx === 0) {
        dx = dy
        dy = 0
      }
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.#size.height : 1
      this.#zoom.translateBy(
        this.#svg,
        (-dx * factor) / this.#transform.k,
        (-dy * factor) / this.#transform.k
      )
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    this.#cleanup.push(() => svg.removeEventListener('wheel', onWheel))
  }

  #setupBackgroundDrag() {
    const d3 = this.#d3
    const svg = this.#svg.node()
    const isBackground = t =>
      t === svg || t.classList?.contains('sg-background') || t.classList?.contains('sg-grid')
    const drag = d3
      .drag()
      .filter(event => event.button === 0 && !this.#spaceDown && isBackground(event.target))
      .container(() => svg)
      .subject(event => ({ x: event.x, y: event.y }))
      .on('start', event => {
        const e = event.sourceEvent
        this.#drag = {
          type: 'marquee',
          start: { x: event.x, y: event.y },
          end: { x: event.x, y: event.y },
          moved: false,
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
        }
      })
      .on('drag', event => {
        const d = this.#drag
        if (d?.type !== 'marquee') return
        d.end = { x: event.x, y: event.y }
        if (!d.moved && Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) < 3) return
        d.moved = true
        const r = rectFromPoints(d.start, d.end)
        this.#marquee
          .attr('visibility', 'visible')
          .attr('x', r.x)
          .attr('y', r.y)
          .attr('width', r.w)
          .attr('height', r.h)
      })
      .on('end', () => {
        const d = this.#drag
        this.#drag = null
        this.#marquee.attr('visibility', 'hidden')
        if (d?.type !== 'marquee') return
        if (!d.moved) {
          if (!d.additive && this.#selection.size) this.#emitIntent({ type: 'select', ids: [] })
          return
        }
        const a = screenToWorld(this.#transform, d.start)
        const b = screenToWorld(this.#transform, d.end)
        const hits = this.#marqueeHits(rectFromPoints(a, b))
        const ids = d.additive ? [...new Set([...this.#selection, ...hits])] : hits
        this.#emitIntent({ type: 'select', ids })
      })
    this.#svg.call(drag)
  }

  /** Nodes and annotations touched by the rectangle, frames inside it, edges between selected nodes. */
  #marqueeHits(rect) {
    const m = this.#model
    const out = []
    for (const id of this.#index.query(rect)) {
      const kind = m.kindOf(id)
      const item = m.get(id)
      if (!item || m.isHidden(item) || m.isLocked(item) || /** @type {any} */ (item).ghost) continue
      if (kind === 'frame') {
        const r = /** @type {Rect} */ (m.rectOf(id))
        if (
          r.x >= rect.x &&
          r.y >= rect.y &&
          r.x + r.w <= rect.x + rect.w &&
          r.y + r.h <= rect.y + rect.h
        )
          out.push(id)
      } else {
        out.push(id)
      }
    }
    const picked = new Set(out)
    for (const e of m.edges.values())
      if (!m.isHidden(e) && picked.has(e.source.node) && picked.has(e.target.node)) out.push(e.id)
    return out
  }

  #setupKeyboard() {
    const svg = this.#svg.node()
    const onKeyDown = event => {
      const key = event.key
      if (key === ' ' && !event.repeat) {
        const focusedNode = event.target?.closest?.('.sg-node')
        if (focusedNode) {
          event.preventDefault()
          const id = focusedNode.getAttribute('data-id')
          this.#clickSelect(id, event.shiftKey || event.ctrlKey || event.metaKey)
          return
        }
        this.#spaceDown = true
        event.preventDefault()
        return
      }
      if (key === 'Escape') {
        if (this.#drag) {
          this.#cancelDrag()
          return
        }
        if (this.#selection.size) this.#emitIntent({ type: 'select', ids: [] })
        return
      }
      if (key === 'Enter') {
        const id =
          event.target?.closest?.('[data-id]')?.getAttribute('data-id') ??
          (this.#selection.size === 1 ? [...this.#selection][0] : null)
        if (id && this.#model.kindOf(id))
          this.#emitIntent({ type: 'open', id, kind: this.#model.kindOf(id) })
        return
      }
      if ((key === 'a' || key === 'A') && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        const m = this.#model
        const ids = [
          ...m.nodes.values(),
          ...m.frames.values(),
          ...m.annotations.values(),
          ...m.edges.values(),
        ]
          .filter(item => !m.isHidden(item) && !(/** @type {any} */ (item).ghost))
          .map(item => item.id)
        this.#emitIntent({ type: 'select', ids })
        return
      }
      if (key === '+' || key === '=') {
        this.zoomBy(1.25)
        return
      }
      if (key === '-' || key === '_') {
        this.zoomBy(0.8)
        return
      }
      if (key === '0' && !event.ctrlKey && !event.metaKey) {
        this.fit({ animate: false })
        return
      }
      if (this.#opts.readOnly) return
      if (this.#opts.deleteKeys.includes(key) && this.#selection.size) {
        event.preventDefault()
        this.#emitIntent({ type: 'delete', ids: [...this.#selection] })
        return
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (key in arrows && this.#selection.size) {
        event.preventDefault()
        const step = event.altKey ? 1 : (this.#opts.grid || 10) * (event.shiftKey ? 10 : 1)
        const [sx, sy] = arrows[key]
        const items = this.#movableClosure([...this.#selection]).map(id => {
          const r = /** @type {Rect} */ (this.#model.rectOf(id))
          const item = /** @type {any} */ (this.#model.get(id))
          return {
            id,
            kind: this.#model.kindOf(id),
            x: r.x + sx * step,
            y: r.y + sy * step,
            parent: item.parent ?? null,
          }
        })
        if (items.length) this.#emitIntent({ type: 'move', items })
      }
    }
    const onKeyUp = event => {
      if (event.key === ' ') this.#spaceDown = false
    }
    const onBlur = () => {
      this.#spaceDown = false
    }
    svg.addEventListener('keydown', onKeyDown)
    svg.addEventListener('keyup', onKeyUp)
    svg.addEventListener('blur', onBlur)
    this.#cleanup.push(() => {
      svg.removeEventListener('keydown', onKeyDown)
      svg.removeEventListener('keyup', onKeyUp)
      svg.removeEventListener('blur', onBlur)
    })
  }

  #setupDrop() {
    const svg = this.#svg.node()
    const accepts = event => {
      const types = [...(event.dataTransfer?.types ?? [])]
      return types.includes(this.#opts.dropType)
    }
    const onDragOver = event => {
      if (this.#opts.readOnly || !accepts(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = event => {
      if (this.#opts.readOnly || !accepts(event)) return
      event.preventDefault()
      const raw = event.dataTransfer.getData(this.#opts.dropType)
      let data = raw
      try {
        data = JSON.parse(raw)
      } catch {
        /* plain text payload */
      }
      const world = this.clientToWorld({ x: event.clientX, y: event.clientY })
      this.#emitIntent({ type: 'drop', data, x: world.x, y: world.y })
    }
    svg.addEventListener('dragover', onDragOver)
    svg.addEventListener('drop', onDrop)
    this.#cleanup.push(() => {
      svg.removeEventListener('dragover', onDragOver)
      svg.removeEventListener('drop', onDrop)
    })
  }

  // ------------------------------------------------------------------------------------------
  // Model helpers
  // ------------------------------------------------------------------------------------------

  #shapeOf(node) {
    return (
      this.#shapes.get(node.shape ?? 'box') ??
      /** @type {import('./shapes.js').ShapeDef} */ (this.#shapes.get('box'))
    )
  }

  #rebuildIndexes() {
    const m = this.#model
    this.#index.clear()
    this.#portIndex.clear()
    for (const map of [m.frames, m.nodes, m.annotations]) {
      for (const item of map.values()) {
        if (m.isHidden(item)) continue
        this.#index.set(item.id, /** @type {Rect} */ (m.rectOf(item.id)))
      }
    }
    for (const node of m.nodes.values()) {
      if (m.isHidden(node) || node.ghost) continue
      for (const [portId, a] of portAnchors(node, node.ports))
        this.#portIndex.set(`${node.id}\u0000${portId}`, { x: a.x, y: a.y, w: 0, h: 0 })
    }
  }

  /** An item's rectangle including any drag or resize in progress. @param {string} id @returns {Rect} */
  #itemRect(id) {
    const r = /** @type {Rect} */ (this.#model.rectOf(id))
    const d = this.#drag
    if (d?.type === 'move' && d.moved && d.idSet?.has(id))
      return { ...r, x: r.x + d.delta.x, y: r.y + d.delta.y }
    if (d?.type === 'resize' && d.id === id && d.rect) return d.rect
    return r
  }

  /** @param {{ node: string, port: string|null }} end @param {{ x: number, y: number }} toward */
  #anchor(end, toward) {
    const node = this.#model.nodes.get(end.node)
    const r = this.#itemRect(end.node)
    if (end.port && node) {
      const a = portAnchors(r, node.ports).get(end.port)
      if (a) return a
    }
    return boundaryAnchor(r, toward)
  }

  #routeOf(edge) {
    const d = this.#drag
    const waypoints = d?.type === 'waypoints' && d.edge === edge.id ? d.waypoints : edge.waypoints
    const sRect = this.#itemRect(edge.source.node)
    const tRect = this.#itemRect(edge.target.node)
    const source = this.#anchor(edge.source, waypoints[0] ?? center(tRect))
    const target = this.#anchor(edge.target, waypoints[waypoints.length - 1] ?? center(sRect))
    const routing = edge.routing ?? this.#opts.routing
    let obstacles = []
    if (routing === 'orthogonal' && !waypoints.length) {
      const area = expand(
        /** @type {Rect} */ (
          union([
            { ...source, w: 0, h: 0 },
            { ...target, w: 0, h: 0 },
          ])
        ),
        240
      )
      obstacles = this.#index
        .query(area, id => {
          const n = this.#model.nodes.get(id)
          return !!n && !n.ghost
        })
        .map(id => this.#itemRect(id))
    }
    const key = `${routing}|${source.x},${source.y},${source.side}|${target.x},${target.y},${target.side}|${JSON.stringify(waypoints)}|${obstacles.map(o => `${o.x},${o.y},${o.w},${o.h}`).join(';')}`
    const cached = this.#routes.get(edge.id)
    if (cached?.key === key) return cached.route
    const route = routeEdge({ source, target, routing, waypoints, obstacles })
    this.#routes.set(edge.id, { key, route })
    return route
  }

  /** Movable items plus everything inside moved frames, without duplicates. @param {string[]} ids */
  #movableClosure(ids) {
    const m = this.#model
    const out = new Set()
    for (const id of ids) {
      const kind = m.kindOf(id)
      const item = /** @type {any} */ (m.get(id))
      if (!kind || !MOVABLE.has(kind) || m.isLocked(item) || item.ghost) continue
      out.add(id)
      if (kind === 'frame')
        for (const inner of m.descendants(id))
          if (!m.isLocked(/** @type {any} */ (m.get(inner)))) out.add(inner)
    }
    return [...out]
  }

  #emitArrange(fn) {
    if (this.#opts.readOnly) return
    const m = this.#model
    const ids = [...this.#selection].filter(id => MOVABLE.has(/** @type {string} */ (m.kindOf(id))))
    const items = ids.map(id => ({ id, .../** @type {Rect} */ (m.rectOf(id)) }))
    const placed = fn(items).filter(p => {
      const r = m.rectOf(p.id)
      return r && (r.x !== p.x || r.y !== p.y)
    })
    if (!placed.length) return
    this.#emitIntent({
      type: 'move',
      items: placed.map(p => ({
        id: p.id,
        kind: m.kindOf(p.id),
        x: p.x,
        y: p.y,
        parent: /** @type {any} */ (m.get(p.id)).parent ?? null,
      })),
    })
  }

  // ------------------------------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------------------------------

  #emit(event, data) {
    for (const fn of [...(this.#listeners.get(event) ?? [])]) {
      try {
        fn(data)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  #emitIntent(intent) {
    this.#emit('intent', intent)
  }

  #clickSelect(id, additive) {
    let ids
    if (additive)
      ids = this.#selection.has(id)
        ? [...this.#selection].filter(x => x !== id)
        : [...this.#selection, id]
    else ids = [id]
    this.#emitIntent({ type: 'select', ids })
  }

  #cancelDrag() {
    this.#drag = null
    this.#marquee.attr('visibility', 'hidden')
    this.#render()
  }

  // ------------------------------------------------------------------------------------------
  // Gestures on items
  // ------------------------------------------------------------------------------------------

  #itemDragBehavior() {
    if (this.#behaviors.item) return this.#behaviors.item
    const d3 = this.#d3
    return (this.#behaviors.item = d3
      .drag()
      .filter(event => event.button === 0 && !this.#spaceDown)
      .container(() => this.#root.node())
      .subject(event => ({ x: event.x, y: event.y }))
      .on('start', (event, d) => {
        const e = event.sourceEvent
        this.#svg.node().focus({ preventScroll: true })
        this.#drag = {
          type: 'move',
          id: d.id,
          start: { x: event.x, y: event.y },
          moved: false,
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
          delta: { x: 0, y: 0 },
          guides: [],
        }
      })
      .on('drag', event => this.#moveDrag(event))
      .on('end', () => this.#moveEnd()))
  }

  #moveDrag(event) {
    const d = this.#drag
    if (d?.type !== 'move') return
    const dx = event.x - d.start.x
    const dy = event.y - d.start.y
    const m = this.#model
    if (!d.moved) {
      if (Math.hypot(dx, dy) * this.#transform.k < 3) return
      const item = /** @type {any} */ (m.get(d.id))
      if (this.#opts.readOnly || !item || m.isLocked(item) || item.ghost) return
      const base = this.#selection.has(d.id) ? [...this.#selection] : [d.id]
      if (!this.#selection.has(d.id)) this.#emitIntent({ type: 'select', ids: [d.id] })
      d.ids = this.#movableClosure(base)
      if (!d.ids.includes(d.id)) return
      d.idSet = new Set(d.ids)
      d.primary = /** @type {Rect} */ (m.rectOf(d.id))
      d.moved = true
    }
    const proposed = { ...d.primary, x: d.primary.x + dx, y: d.primary.y + dy }
    let x = proposed.x
    let y = proposed.y
    d.guides = []
    if (this.#opts.snap && !event.sourceEvent?.altKey) {
      const k = this.#transform.k
      const near = this.#index
        .query(expand(proposed, 400 / k), id => !d.idSet.has(id) && m.kindOf(id) !== 'frame')
        .map(id => /** @type {Rect} */ (m.rectOf(id)))
      const snapped = snapMove(proposed, near, {
        grid: this.#opts.grid,
        threshold: 6 / k,
        guides: this.#opts.guides,
      })
      x = snapped.x
      y = snapped.y
      d.guides = snapped.guides
    }
    d.delta = { x: x - d.primary.x, y: y - d.primary.y }
    this.#render()
  }

  #moveEnd() {
    const d = this.#drag
    if (d?.type !== 'move') return
    this.#drag = null
    if (!d.moved) {
      this.#clickSelect(d.id, d.additive)
      this.#render()
      return
    }
    const m = this.#model
    if (d.delta.x !== 0 || d.delta.y !== 0) {
      const movingFrames = new Set(d.ids.filter(id => m.kindOf(id) === 'frame'))
      const items = d.ids.map(id => {
        const r = /** @type {Rect} */ (m.rectOf(id))
        const item = /** @type {any} */ (m.get(id))
        const next = { x: r.x + d.delta.x, y: r.y + d.delta.y }
        const carried = item.parent && d.idSet.has(item.parent)
        const exclude = new Set(movingFrames)
        const parent = carried ? item.parent : m.frameAt(center({ ...r, ...next }), exclude)
        return { id, kind: m.kindOf(id), x: next.x, y: next.y, parent: parent ?? null }
      })
      this.#emitIntent({ type: 'move', items })
    }
    this.#render()
  }

  #portDragBehavior() {
    if (this.#behaviors.port) return this.#behaviors.port
    const d3 = this.#d3
    return (this.#behaviors.port = d3
      .drag()
      .filter(event => event.button === 0 && !this.#spaceDown && !this.#opts.readOnly)
      .container(() => this.#root.node())
      .subject(event => ({ x: event.x, y: event.y }))
      .on('start', (event, p) => {
        event.sourceEvent?.stopPropagation()
        const node = this.#model.nodes.get(p.node)
        const spec = node?.ports.find(q => q.id === p.id)
        this.#drag = {
          type: 'connect',
          source: { node: p.node, port: p.id, spec },
          reverse: spec?.direction === 'in',
          pointer: { x: event.x, y: event.y },
          target: null,
          moved: false,
        }
      })
      .on('drag', event => {
        const d = this.#drag
        if (d?.type !== 'connect') return
        d.pointer = { x: event.x, y: event.y }
        d.moved = true
        d.target = this.#connectTarget(d.pointer, d.source, d.reverse)
        this.#renderHandles()
      })
      .on('end', () => {
        const d = this.#drag
        this.#drag = null
        if (d?.type === 'connect' && d.moved) {
          const strip = e => ({ node: e.node, port: e.port })
          if (d.target) {
            const [source, target] = d.reverse ? [d.target, d.source] : [d.source, d.target]
            this.#emitIntent({ type: 'connect', source: strip(source), target: strip(target) })
          } else {
            this.#emitIntent({
              type: 'connect-to-point',
              source: strip(d.source),
              x: d.pointer.x,
              y: d.pointer.y,
            })
          }
        }
        this.#renderHandles()
      }))
  }

  /**
   * The port a connection gesture would end on: a port near the pointer, else the first
   * suitable port of the node under it.
   */
  #connectTarget(point, source, reverse) {
    const m = this.#model
    const allowed = target => {
      if (target.node === source.node && target.port === source.port) return false
      const [s, t] = reverse ? [target, source] : [source, target]
      if (this.#opts.canConnect) return !!this.#opts.canConnect(s, t)
      if (s.node === t.node) return false
      return s.spec?.direction !== 'in' && t.spec?.direction !== 'out'
    }
    const info = key => {
      const [node, port] = key.split('\u0000')
      return { node, port, spec: m.nodes.get(node)?.ports.find(q => q.id === port) }
    }
    const radius = 14 / this.#transform.k
    const near = this.#portIndex.nearest(point, radius, key => allowed(info(key)))
    if (near) return info(near)
    const under = this.#index.query({ x: point.x, y: point.y, w: 0, h: 0 }, id => {
      const n = m.nodes.get(id)
      return !!n && !n.ghost
    })
    for (const nodeId of under.reverse()) {
      const node = /** @type {any} */ (m.nodes.get(nodeId))
      if (!node.ports.length) {
        const whole = { node: nodeId, port: null, spec: undefined }
        if (allowed(whole)) return whole
        continue
      }
      const anchors = portAnchors(node, node.ports)
      const ranked = node.ports
        .map(spec => ({
          node: nodeId,
          port: spec.id,
          spec,
          dist: Math.hypot(anchors.get(spec.id).x - point.x, anchors.get(spec.id).y - point.y),
        }))
        .filter(allowed)
        .sort((a, b) => a.dist - b.dist)
      if (ranked.length) return ranked[0]
    }
    return null
  }

  #resizeDragBehavior() {
    if (this.#behaviors.resize) return this.#behaviors.resize
    const d3 = this.#d3
    return (this.#behaviors.resize = d3
      .drag()
      .filter(event => event.button === 0 && !this.#opts.readOnly)
      .container(() => this.#root.node())
      .subject(event => ({ x: event.x, y: event.y }))
      .on('start', (event, h) => {
        event.sourceEvent?.stopPropagation()
        this.#drag = {
          type: 'resize',
          id: h.id,
          dir: h.dir,
          start: { x: event.x, y: event.y },
          rect0: /** @type {Rect} */ (this.#model.rectOf(h.id)),
          rect: null,
        }
      })
      .on('drag', event => {
        const d = this.#drag
        if (d?.type !== 'resize') return
        const { rect0, dir } = d
        const g = this.#opts.snap && !event.sourceEvent?.altKey ? this.#opts.grid : 0
        const min = 16
        let x1 = rect0.x
        let y1 = rect0.y
        let x2 = rect0.x + rect0.w
        let y2 = rect0.y + rect0.h
        const dx = event.x - d.start.x
        const dy = event.y - d.start.y
        if (dir.includes('w')) x1 = Math.min(snap(rect0.x + dx, g), x2 - min)
        if (dir.includes('e')) x2 = Math.max(snap(rect0.x + rect0.w + dx, g), x1 + min)
        if (dir.includes('n')) y1 = Math.min(snap(rect0.y + dy, g), y2 - min)
        if (dir.includes('s')) y2 = Math.max(snap(rect0.y + rect0.h + dy, g), y1 + min)
        d.rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
        this.#render()
      })
      .on('end', () => {
        const d = this.#drag
        this.#drag = null
        if (d?.type === 'resize' && d.rect) {
          const { x, y, w, h } = d.rect
          const r0 = d.rect0
          if (x !== r0.x || y !== r0.y || w !== r0.w || h !== r0.h) {
            this.#emitIntent({
              type: 'resize',
              id: d.id,
              kind: this.#model.kindOf(d.id),
              x,
              y,
              w,
              h,
            })
          }
        }
        this.#render()
      }))
  }

  #edgeHandleDragBehavior() {
    if (this.#behaviors.edgeHandle) return this.#behaviors.edgeHandle
    const d3 = this.#d3
    return (this.#behaviors.edgeHandle = d3
      .drag()
      .filter(event => event.button === 0 && !this.#opts.readOnly)
      .container(() => this.#root.node())
      .subject(event => ({ x: event.x, y: event.y }))
      .on('start', (event, h) => {
        event.sourceEvent?.stopPropagation()
        const edge = this.#model.edges.get(h.edge)
        if (!edge) return
        if (h.role === 'end') {
          const fixed = h.end === 'source' ? edge.target : edge.source
          const fixedNode = this.#model.nodes.get(fixed.node)
          this.#drag = {
            type: 'reconnect',
            edge: h.edge,
            end: h.end,
            fixed: {
              node: fixed.node,
              port: fixed.port,
              spec: fixedNode?.ports.find(q => q.id === fixed.port),
            },
            pointer: { x: event.x, y: event.y },
            target: null,
            moved: false,
          }
        } else {
          const waypoints = edge.waypoints.map(p => ({ ...p }))
          const index = h.index
          if (h.role === 'insert') waypoints.splice(index, 0, { x: event.x, y: event.y })
          this.#drag = { type: 'waypoints', edge: h.edge, index, waypoints, moved: false }
        }
      })
      .on('drag', event => {
        const d = this.#drag
        if (!d) return
        d.moved = true
        if (d.type === 'reconnect') {
          d.pointer = { x: event.x, y: event.y }
          // The moving end must be a target if the fixed end is the source, and vice versa.
          d.target = this.#connectTarget(d.pointer, d.fixed, d.end === 'source')
          this.#renderHandles()
        } else if (d.type === 'waypoints') {
          const g = this.#opts.snap && !event.sourceEvent?.altKey ? this.#opts.grid : 0
          d.waypoints[d.index] = { x: snap(event.x, g), y: snap(event.y, g) }
          this.#render()
        }
      })
      .on('end', () => {
        const d = this.#drag
        this.#drag = null
        if (d?.moved && d.type === 'reconnect' && d.target) {
          this.#emitIntent({
            type: 'reconnect',
            edge: d.edge,
            end: d.end,
            to: { node: d.target.node, port: d.target.port },
          })
        } else if (d?.moved && d.type === 'waypoints') {
          this.#emitIntent({ type: 'waypoints', edge: d.edge, waypoints: d.waypoints })
        }
        this.#render()
      }))
  }

  #bindItem(sel, kind) {
    const self = this
    sel
      .call(this.#itemDragBehavior())
      .on('dblclick', (event, d) => {
        event.stopPropagation()
        self.#emitIntent({ type: 'open', id: d.id, kind })
      })
      .on('contextmenu', (event, d) => {
        event.preventDefault()
        event.stopPropagation()
        const world = self.clientToWorld({ x: event.clientX, y: event.clientY })
        self.#emitIntent({
          type: 'context',
          id: d.id,
          kind,
          clientX: event.clientX,
          clientY: event.clientY,
          x: world.x,
          y: world.y,
        })
      })
      .on('pointerenter', function (event, d) {
        self.#d3.select(this).classed('sg-hover', true)
        self.#emit('hover', { id: d.id, kind })
      })
      .on('pointerleave', function () {
        self.#d3.select(this).classed('sg-hover', false)
        self.#emit('hover', null)
      })
  }

  // ------------------------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------------------------

  #scheduleCull() {
    if (!this.#stats.culled && this.#countItems() <= this.#opts.cullThreshold) return
    const view = visibleRect(this.#transform, this.#size)
    const area = this.#renderedArea
    if (
      area &&
      view.x >= area.x &&
      view.y >= area.y &&
      view.x + view.w <= area.x + area.w &&
      view.y + view.h <= area.y + area.h
    )
      return
    cancelAnimationFrame(this.#raf)
    this.#raf = requestAnimationFrame(() => this.#render())
  }

  #countItems() {
    const m = this.#model
    return m.nodes.size + m.frames.size + m.annotations.size + m.edges.size
  }

  #render() {
    const started = performance.now()
    this.#renderScene(this.#layers, { interactive: true, only: null })
    this.#renderHandles()
    this.#stats.ms = Math.round((performance.now() - started) * 10) / 10
    this.#emit('render', this.stats)
  }

  /**
   * Draws frames, regions, edges, nodes and annotations into a set of layers.
   * @param {Record<string, any>} L
   * @param {{ interactive: boolean, only: Set<string>|null }} options
   */
  #renderScene(L, { interactive, only }) {
    const m = this.#model
    let visible = null
    let area = null
    if (interactive && this.#countItems() > this.#opts.cullThreshold) {
      const view = visibleRect(this.#transform, this.#size)
      area = expand(view, Math.max(view.w, view.h) * 0.5)
      visible = new Set(this.#index.query(area))
      for (const id of this.#selection) visible.add(id)
    }
    if (interactive) this.#renderedArea = area
    const show = item =>
      !m.isHidden(item) && (!only || only.has(item.id)) && (!visible || visible.has(item.id))
    const frames = m.framesInOrder().filter(show)
    const nodes = [...m.nodes.values()].filter(show)
    const annotations = [...m.annotations.values()].filter(show)
    const shownNodes = new Set(nodes.map(n => n.id))
    const edges = [...m.edges.values()].filter(e => {
      if (
        m.isHidden(e) ||
        (only && !only.has(e.id) && !(only.has(e.source.node) && only.has(e.target.node)))
      )
        return false
      if (!visible) return true
      if (shownNodes.has(e.source.node) || shownNodes.has(e.target.node)) return true
      const box = union([this.#itemRect(e.source.node), this.#itemRect(e.target.node)])
      return !!box && !!area && intersects(box, area)
    })
    if (interactive)
      this.#stats = {
        ...this.#stats,
        nodes: nodes.length,
        edges: edges.length,
        frames: frames.length,
        annotations: annotations.length,
        culled: !!visible,
      }

    const highlight = this.#overlays.get('highlight')
    const dim = highlight ? new Set(highlight.ids ?? []) : null
    this.#renderFrames(L.frames, frames, interactive, dim)
    this.#renderAnnotations(
      L.regions,
      annotations.filter(a => a.kind === 'region'),
      interactive,
      dim
    )
    this.#renderEdges(L.edges, edges, interactive, dim)
    this.#renderNodes(L.nodes, nodes, interactive, dim)
    this.#renderAnnotations(
      L.annotations,
      annotations.filter(a => a.kind !== 'region'),
      interactive,
      dim
    )
  }

  #renderFrames(layer, frames, interactive, dim) {
    const m = this.#model
    const sel = layer.selectChildren('g.sg-frame').data(frames, d => d.id)
    sel.exit().remove()
    const enter = sel
      .enter()
      .append('g')
      .attr('data-id', d => d.id)
    enter.append('rect').attr('class', 'sg-frame-rect')
    enter.append('text').attr('class', 'sg-frame-label')
    if (interactive) {
      enter.append('rect').attr('class', 'sg-frame-title').attr('height', 24)
      this.#bindItem(enter, 'frame')
    }
    const selected = d => interactive && this.#selection.has(d.id)
    const dimmed = d => !!dim && !dim.has(d.id)
    const all = enter
      .merge(sel)
      .filter((d, i, nodes) =>
        stale(nodes[i], [d, this.#itemRect(d.id), selected(d), m.isLocked(d), dimmed(d)])
      )
    all
      .attr('class', d => `sg-frame sg-kind-${d.kind}`)
      .classed('sg-selected', d => interactive && this.#selection.has(d.id))
      .classed('sg-locked', d => m.isLocked(d))
      .classed('sg-dimmed', d => !!dim && !dim.has(d.id))
    all.each((d, i, nodes) => {
      const g = this.#d3.select(nodes[i])
      const r = this.#itemRect(d.id)
      g.select('.sg-frame-rect')
        .attr('x', r.x)
        .attr('y', r.y)
        .attr('width', r.w)
        .attr('height', r.h)
        .attr('rx', 8)
        .style('stroke', d.style?.stroke ?? null)
        .style('fill', d.style?.fill ?? null)
      g.select('.sg-frame-label')
        .attr('x', r.x + 10)
        .attr('y', r.y + 7)
        .text(d.label ?? '')
      g.select('.sg-frame-title').attr('x', r.x).attr('y', r.y).attr('width', r.w)
    })
  }

  #renderNodes(layer, nodes, interactive, dim) {
    const m = this.#model
    const sel = layer.selectChildren('g.sg-node').data(nodes, d => d.id)
    const leaving = sel.exit()
    // Keep keyboard focus in the canvas when the focused node goes away (e.g. after Delete).
    if (
      interactive &&
      leaving
        .filter(function () {
          return this.contains(/** @type {any} */ (this.getRootNode()).activeElement)
        })
        .size()
    ) {
      this.#svg.node().focus({ preventScroll: true })
    }
    leaving.remove()
    const enter = sel
      .enter()
      .append('g')
      .attr('class', 'sg-node')
      .attr('data-id', d => d.id)
    enter.append('g').attr('class', 'sg-body')
    enter.append('g').attr('class', 'sg-decor')
    enter.append('g').attr('class', 'sg-ports')
    if (interactive) this.#bindItem(enter, 'node')
    const heat = this.#overlays.get('heatmap')
    const badges = this.#overlays.get('badges')
    const heatDomain = heat ? domainOf(heat) : null
    const target =
      this.#drag?.type === 'connect' || this.#drag?.type === 'reconnect' ? this.#drag.target : null
    const all = enter
      .merge(sel)
      .filter((d, i, groups) =>
        stale(groups[i], [
          d,
          this.#itemRect(d.id),
          interactive,
          interactive && this.#selection.has(d.id),
          m.isLocked(d),
          !!dim && !dim.has(d.id),
          heat?.values?.[d.id] ?? null,
          heat ? heatDomain : null,
          badges?.values?.[d.id] ?? null,
          target?.node === d.id ? target.port : null,
          this.#opts.portRadius,
          this.#themeVersion,
        ])
      )
    all
      .attr('transform', d => {
        const r = this.#itemRect(d.id)
        return `translate(${r.x},${r.y})`
      })
      .classed('sg-selected', d => interactive && this.#selection.has(d.id))
      .classed('sg-ghost', d => !!d.ghost)
      .classed('sg-composite', d => !!d.composite)
      .classed('sg-locked', d => m.isLocked(d))
      .classed('sg-dimmed', d => !!dim && !dim.has(d.id))
    if (interactive) {
      all
        .attr('tabindex', d => (d.ghost ? null : 0))
        .attr('role', 'button')
        .attr('aria-pressed', d => String(this.#selection.has(d.id)))
        .attr(
          'aria-label',
          d => [d.title ?? d.label, d.sublabel].filter(Boolean).join(', ') || d.id
        )
    }
    const heatColor = heat
      ? this.#d3.interpolateRgb?.(this.#tokens.heatLow, this.#tokens.heatHigh)
      : null
    const portDrag = interactive ? this.#portDragBehavior() : null
    all.each((d, i, groups) => {
      const g = this.#d3.select(groups[i])
      const r = this.#itemRect(d.id)
      this.#renderNodeBody(g, d, r)

      // Ports
      const anchors = portAnchors({ x: 0, y: 0, w: r.w, h: r.h }, d.ports)
      const ports = d.ports.map(p => ({ ...p, node: d.id, a: anchors.get(p.id) }))
      const psel = g
        .select('.sg-ports')
        .selectChildren('circle.sg-port')
        .data(ports, p => p.id)
      psel.exit().remove()
      const penter = psel.enter().append('circle').attr('class', 'sg-port')
      penter.append('title')
      if (portDrag && !d.ghost) penter.call(portDrag)
      penter
        .merge(psel)
        .attr('cx', p => p.a.x)
        .attr('cy', p => p.a.y)
        .attr('r', this.#opts.portRadius)
        .attr('data-port', p => p.id)
        .classed('sg-port-target', p => !!target && target.node === d.id && target.port === p.id)
        .select('title')
        .text(p => p.label ?? p.id)

      // Overlays: heat tint and badge
      const decor = g.select('.sg-decor')
      const hv = heat?.values?.[d.id]
      const heatSel = decor.selectChildren('rect.sg-heat').data(typeof hv === 'number' ? [hv] : [])
      heatSel.exit().remove()
      heatSel
        .enter()
        .append('rect')
        .attr('class', 'sg-heat')
        .merge(heatSel)
        .attr('width', r.w)
        .attr('height', r.h)
        .attr('rx', Number(this.#tokens.radius) || 0)
        .attr('fill', v =>
          heatColor ? heatColor(normalise(v, heatDomain)) : this.#tokens.heatHigh
        )
        .attr('fill-opacity', 0.4)
      const badge = badges?.values?.[d.id] ?? d.badge
      const show = badge !== undefined && badge !== null && badge !== '' && badge !== 0
      const bsel = decor.selectChildren('g.sg-badge').data(show ? [String(badge)] : [])
      bsel.exit().remove()
      const benter = bsel.enter().append('g').attr('class', 'sg-badge')
      benter.append('circle').attr('r', 9)
      benter.append('text')
      benter
        .merge(bsel)
        .attr('transform', `translate(${r.w - 2},2)`)
        .select('text')
        .text(v => v)
    })
  }

  #renderNodeBody(g, d, r) {
    const key = JSON.stringify([
      d.shape,
      r.w,
      r.h,
      d.label,
      d.sublabel,
      d.icon,
      d.style,
      this.#themeVersion,
    ])
    const node = g.node()
    if (node.__sgKey === key) return
    node.__sgKey = key
    const body = g.select('.sg-body')
    body.selectAll('*').remove()
    const shape = this.#shapeOf(d)
    const dd = { ...d, w: r.w, h: r.h }
    shape.render(body, dd, { theme: this.#tokens, radius: Number(this.#tokens.radius) || 0 })
    const style = d.style ?? {}
    body
      .selectAll('.sg-shape')
      .style('fill', style.fill ?? null)
      .style('stroke', style.stroke ?? null)
      .style('stroke-dasharray', style.dash ?? null)
    if (style.opacity !== undefined) body.style('opacity', style.opacity)
    let box = shape.labelBox?.(dd) ?? { x: 6, y: 4, w: dd.w - 12, h: dd.h - 8 }
    if (d.icon) {
      const icon = this.#icon(d.icon)
      if (icon) {
        // Inside the label box, so it stays within curved and slanted outlines too.
        const size = Math.max(10, Math.min(18, box.h - 4))
        const el = /** @type {SVGSVGElement} */ (icon.cloneNode(true))
        el.setAttribute('class', 'sg-icon')
        el.setAttribute('x', String(box.x))
        el.setAttribute('y', String(box.h > 40 ? box.y + 2 : box.y + (box.h - size) / 2))
        el.setAttribute('width', String(size))
        el.setAttribute('height', String(size))
        body.node().appendChild(el)
        box = { ...box, x: box.x + size + 2, w: Math.max(10, box.w - size - 2) }
      }
    }
    if (shape.label === false || !d.label) return
    const lineH = this.#fontSize * 1.25
    const sub = d.sublabel ? 1 : 0
    const maxLines = Math.max(1, Math.floor(box.h / lineH) - sub)
    const lines = wrapText(d.label, box.w, this.#measureBold, { maxLines })
    const total = (lines.length + sub) * lineH
    let y = box.y + box.h / 2 - total / 2 + lineH / 2
    const cx = box.x + box.w / 2
    const label = body.append('text').attr('class', 'sg-label')
    for (const line of lines) {
      label.append('tspan').attr('x', cx).attr('y', y).text(line)
      y += lineH
    }
    if (d.sublabel) {
      const [text] = wrapText(d.sublabel, box.w, this.#measure, { maxLines: 1 })
      body.append('text').attr('class', 'sg-sublabel').attr('x', cx).attr('y', y).text(text)
    }
  }

  #icon(markup) {
    if (!this.#iconCache.has(markup))
      this.#iconCache.set(markup, sanitizeSvg(markup, `${this.#uid}-i${this.#iconCache.size}`))
    return this.#iconCache.get(markup)
  }

  #renderEdges(layer, edges, interactive, dim) {
    const m = this.#model
    const sel = layer.selectChildren('g.sg-edge').data(edges, d => d.id)
    sel.exit().remove()
    const enter = sel
      .enter()
      .append('g')
      .attr('class', 'sg-edge')
      .attr('data-id', d => d.id)
    if (interactive) enter.append('path').attr('class', 'sg-edge-hit')
    enter.append('path').attr('class', 'sg-edge-path')
    const label = enter.append('g').attr('class', 'sg-edge-label-group')
    label.append('rect').attr('class', 'sg-edge-label-bg').attr('rx', 3)
    label.append('text').attr('class', 'sg-edge-label')
    if (interactive) {
      const self = this
      enter
        .on('pointerdown', (event, d) => {
          if (event.button !== 0) return
          event.stopPropagation()
          self.#svg.node().focus({ preventScroll: true })
          self.#clickSelect(d.id, event.shiftKey || event.ctrlKey || event.metaKey)
        })
        .on('dblclick', (event, d) => {
          event.stopPropagation()
          self.#emitIntent({ type: 'open', id: d.id, kind: 'edge' })
        })
        .on('contextmenu', (event, d) => {
          event.preventDefault()
          event.stopPropagation()
          const world = self.clientToWorld({ x: event.clientX, y: event.clientY })
          self.#emitIntent({
            type: 'context',
            id: d.id,
            kind: 'edge',
            clientX: event.clientX,
            clientY: event.clientY,
            x: world.x,
            y: world.y,
          })
        })
        .on('pointerenter', function (event, d) {
          self.#d3.select(this).classed('sg-hover', true)
          self.#emit('hover', { id: d.id, kind: 'edge' })
        })
        .on('pointerleave', function () {
          self.#d3.select(this).classed('sg-hover', false)
          self.#emit('hover', null)
        })
    }
    const widths = this.#overlays.get('edge-width')
    const wDomain = widths ? domainOf(widths) : null
    const [wMin, wMax] = widths?.range ?? [1, 8]
    const all = enter
      .merge(sel)
      .filter((d, i, groups) =>
        stale(groups[i], [
          d,
          this.#routeOf(d).path,
          interactive && this.#selection.has(d.id),
          !!(m.nodes.get(d.source.node)?.ghost || m.nodes.get(d.target.node)?.ghost),
          !!dim && !dim.has(d.id),
          widths?.values?.[d.id] ?? null,
          widths ? [wDomain, wMin, wMax] : null,
          this.#themeVersion,
        ])
      )
    all
      .classed('sg-selected', d => interactive && this.#selection.has(d.id))
      .classed(
        'sg-ghost',
        d => !!(m.nodes.get(d.source.node)?.ghost || m.nodes.get(d.target.node)?.ghost)
      )
      .classed('sg-dimmed', d => !!dim && !dim.has(d.id))
    all.each((d, i, groups) => {
      const g = this.#d3.select(groups[i])
      const route = this.#routeOf(d)
      const selected = interactive && this.#selection.has(d.id)
      g.select('.sg-edge-hit').attr('d', route.path)
      const wv = widths?.values?.[d.id]
      g.select('.sg-edge-path')
        .attr('d', route.path)
        .attr(
          'marker-end',
          d.arrow === false ? null : `url(#${this.#uid}-arrow${selected ? '-active' : ''})`
        )
        .style('stroke', d.style?.stroke ?? null)
        .style('stroke-dasharray', d.style?.dash ?? null)
        .style(
          'stroke-width',
          typeof wv === 'number'
            ? String(wMin + (wMax - wMin) * normalise(wv, wDomain))
            : (d.style?.width ?? null)
        )
      const lg = g.select('.sg-edge-label-group').attr('display', d.label ? null : 'none')
      if (d.label) {
        const w = this.#measure(d.label) + 8
        const h = this.#fontSize + 6
        lg.select('.sg-edge-label-bg')
          .attr('x', route.label.x - w / 2)
          .attr('y', route.label.y - h / 2)
          .attr('width', w)
          .attr('height', h)
        lg.select('.sg-edge-label').attr('x', route.label.x).attr('y', route.label.y).text(d.label)
      }
    })
  }

  #renderAnnotations(layer, annotations, interactive, dim) {
    const m = this.#model
    const sel = layer.selectChildren('g.sg-annotation').data(annotations, d => d.id)
    sel.exit().remove()
    const enter = sel
      .enter()
      .append('g')
      .attr('data-id', d => d.id)
    if (interactive) this.#bindItem(enter, 'annotation')
    const all = enter.merge(sel)
    all
      .filter((d, i, groups) =>
        stale(groups[i], [
          d.kind,
          interactive && this.#selection.has(d.id),
          m.isLocked(d),
          !!dim && !dim.has(d.id),
        ])
      )
      .attr('class', d => `sg-annotation sg-kind-${d.kind}`)
      .classed('sg-selected', d => interactive && this.#selection.has(d.id))
      .classed('sg-locked', d => m.isLocked(d))
      .classed('sg-dimmed', d => !!dim && !dim.has(d.id))
    all.each((d, i, groups) => {
      const g = this.#d3.select(groups[i])
      const r = this.#itemRect(d.id)
      const key = JSON.stringify([
        d.kind,
        d.form,
        r,
        d.text,
        d.style,
        d.target,
        this.#themeVersion,
        d.kind === 'callout' && typeof d.target === 'string' ? this.#model.rectOf(d.target) : null,
      ])
      if (groups[i].__sgKey === key) return
      groups[i].__sgKey = key
      g.selectAll('*').remove()
      if (d.kind === 'callout' && d.target) {
        const to =
          typeof d.target === 'string'
            ? (() => {
                const tr = this.#model.rectOf(d.target)
                return tr ? boundaryAnchor(tr, center(r)) : null
              })()
            : d.target
        if (to) {
          const from = boundaryAnchor(r, to)
          g.append('path')
            .attr('class', 'sg-leader')
            .attr('d', `M${from.x},${from.y} L${to.x},${to.y}`)
        }
      }
      if (d.kind === 'shape' && d.form === 'ellipse') {
        g.append('ellipse')
          .attr('class', 'sg-note')
          .attr('cx', r.x + r.w / 2)
          .attr('cy', r.y + r.h / 2)
          .attr('rx', r.w / 2)
          .attr('ry', r.h / 2)
      } else if (d.kind === 'shape' && d.form === 'diamond') {
        g.append('path')
          .attr('class', 'sg-note')
          .attr(
            'd',
            `M${r.x + r.w / 2},${r.y} L${r.x + r.w},${r.y + r.h / 2} L${r.x + r.w / 2},${r.y + r.h} L${r.x},${r.y + r.h / 2} Z`
          )
      } else {
        g.append('rect')
          .attr('class', 'sg-note')
          .attr('x', r.x)
          .attr('y', r.y)
          .attr('width', r.w)
          .attr('height', r.h)
          .attr('rx', d.kind === 'sticky' ? 2 : 6)
      }
      g.select('.sg-note')
        .style('fill', d.style?.fill ?? null)
        .style('stroke', d.style?.stroke ?? null)
      if (d.text) {
        const pad = 8
        const lineH = this.#fontSize * 1.3
        const maxLines = Math.max(1, Math.floor((r.h - 2 * pad) / lineH))
        const lines = wrapText(d.text, r.w - 2 * pad, this.#measure, { maxLines })
        const text = g.append('text').attr('class', 'sg-annotation-text')
        lines.forEach((line, n) =>
          text
            .append('tspan')
            .attr('x', r.x + pad)
            .attr('y', r.y + pad + n * lineH)
            .text(line)
        )
      }
    })
  }

  /** Selection handles, guides and the connection preview; cheap enough to redraw often. */
  #renderHandles() {
    const L = this.#layers
    if (!L.handles) return
    const k = this.#transform.k
    const m = this.#model
    const d = this.#drag
    const size = 8 / k

    // Guides
    const guides = d?.type === 'move' ? d.guides : []
    const gsel = L.guides.selectChildren('line.sg-guide').data(guides)
    gsel.exit().remove()
    gsel
      .enter()
      .append('line')
      .attr('class', 'sg-guide')
      .merge(gsel)
      .filter((g, i, nodes) => stale(nodes[i], [g, k]))
      .attr('x1', g => (g.axis === 'x' ? g.value : g.from))
      .attr('x2', g => (g.axis === 'x' ? g.value : g.to))
      .attr('y1', g => (g.axis === 'x' ? g.from : g.value))
      .attr('y2', g => (g.axis === 'x' ? g.to : g.value))
      .attr('stroke-width', 1 / k)

    // Resize handles for a single selected box
    const single = this.#selection.size === 1 ? [...this.#selection][0] : null
    const kind = single ? m.kindOf(single) : null
    const item = single ? /** @type {any} */ (m.get(single)) : null
    const resizable =
      !this.#opts.readOnly &&
      item &&
      kind &&
      MOVABLE.has(kind) &&
      !m.isLocked(item) &&
      !item.ghost &&
      !m.isHidden(item) &&
      d?.type !== 'move'
    const handles = []
    if (resizable) {
      const r = this.#itemRect(/** @type {string} */ (single))
      const pos = {
        nw: [r.x, r.y],
        n: [r.x + r.w / 2, r.y],
        ne: [r.x + r.w, r.y],
        e: [r.x + r.w, r.y + r.h / 2],
        se: [r.x + r.w, r.y + r.h],
        s: [r.x + r.w / 2, r.y + r.h],
        sw: [r.x, r.y + r.h],
        w: [r.x, r.y + r.h / 2],
      }
      for (const dir of HANDLE_DIRS)
        handles.push({ id: single, dir, x: pos[dir][0], y: pos[dir][1] })
    }
    const hsel = L.handles.selectChildren('rect.sg-handle').data(handles, h => h.dir)
    hsel.exit().remove()
    hsel
      .enter()
      .append('rect')
      .call(this.#resizeDragBehavior())
      .merge(hsel)
      .filter((h, i, nodes) => stale(nodes[i], [h, k]))
      .attr('class', h => `sg-handle sg-handle-${h.dir}`)
      .attr('x', h => h.x - size / 2)
      .attr('y', h => h.y - size / 2)
      .attr('width', size)
      .attr('height', size)
      .attr('stroke-width', 1.5 / k)

    // Edge handles for a single selected edge
    const edgeHandles = []
    if (!this.#opts.readOnly && kind === 'edge' && d?.type !== 'reconnect') {
      const edge = /** @type {any} */ (m.edges.get(/** @type {string} */ (single)))
      const route = this.#routeOf(edge)
      const pts = route.points
      const waypoints = d?.type === 'waypoints' && d.edge === edge.id ? d.waypoints : edge.waypoints
      edgeHandles.push({
        edge: edge.id,
        role: 'end',
        end: 'source',
        x: pts[0].x,
        y: pts[0].y,
        key: 'source',
      })
      edgeHandles.push({
        edge: edge.id,
        role: 'end',
        end: 'target',
        x: pts[pts.length - 1].x,
        y: pts[pts.length - 1].y,
        key: 'target',
      })
      waypoints.forEach((p, index) =>
        edgeHandles.push({
          edge: edge.id,
          role: 'waypoint',
          index,
          x: p.x,
          y: p.y,
          key: `w${index}`,
        })
      )
      const control = [pts[0], ...waypoints, pts[pts.length - 1]]
      for (let index = 0; index < control.length - 1; index++) {
        const a = control[index]
        const b = control[index + 1]
        edgeHandles.push({
          edge: edge.id,
          role: 'insert',
          index,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          key: `i${index}`,
        })
      }
    }
    const esel = L.handles.selectChildren('circle.sg-edge-handle').data(edgeHandles, h => h.key)
    esel.exit().remove()
    const self = this
    esel
      .enter()
      .append('circle')
      .call(this.#edgeHandleDragBehavior())
      .on('dblclick', function (event, h) {
        event.stopPropagation()
        if (h.role !== 'waypoint' || self.#opts.readOnly) return
        const edge = m.edges.get(h.edge)
        if (!edge) return
        self.#emitIntent({
          type: 'waypoints',
          edge: h.edge,
          waypoints: edge.waypoints.filter((_, i) => i !== h.index),
        })
      })
      .merge(esel)
      .filter((h, i, nodes) => stale(nodes[i], [h, k]))
      .attr(
        'class',
        h =>
          `sg-edge-handle ${h.role === 'insert' ? 'sg-waypoint sg-waypoint-new' : h.role === 'waypoint' ? 'sg-waypoint' : 'sg-handle'}`
      )
      .attr('cx', h => h.x)
      .attr('cy', h => h.y)
      .attr('r', h => (h.role === 'insert' ? 3.5 : 5) / k)
      .attr('stroke-width', 1.5 / k)

    // Connection preview
    let ghost = []
    if ((d?.type === 'connect' || d?.type === 'reconnect') && d.moved) {
      const fixed = d.type === 'connect' ? d.source : d.fixed
      const toward = d.target ? this.#portPoint(d.target) : d.pointer
      const from = this.#anchor(fixed, toward)
      const to = d.target ? this.#anchor(d.target, from) : { ...d.pointer, side: null }
      const [s, t] = (d.type === 'connect' ? d.reverse : d.end === 'source')
        ? [to, from]
        : [from, to]
      ghost = [
        routeEdge({
          source: s,
          target: t,
          routing: this.#opts.routing === 'curved' ? 'curved' : 'orthogonal',
        }).path,
      ]
    }
    const csel = L.handles.selectChildren('path.sg-ghost-edge').data(ghost)
    csel.exit().remove()
    csel
      .enter()
      .append('path')
      .attr('class', 'sg-ghost-edge')
      .merge(csel)
      .filter((p, i, nodes) => stale(nodes[i], [p, k]))
      .attr('d', p => p)
      .attr('stroke-width', 1.5 / k)
    const connecting = d?.type === 'connect' || d?.type === 'reconnect'
    if (connecting || this.#portTargetShown) {
      L.nodes.selectAll('.sg-port').classed('sg-port-target', function () {
        if (!connecting || !d.target) return false
        const nodeId = this.parentNode?.parentNode?.getAttribute('data-id')
        return nodeId === d.target.node && this.getAttribute('data-port') === d.target.port
      })
      this.#portTargetShown = connecting
    }
  }

  #portPoint(end) {
    const node = this.#model.nodes.get(end.node)
    const r = this.#itemRect(end.node)
    if (end.port && node) return portAnchors(r, node.ports).get(end.port) ?? center(r)
    return center(r)
  }
}

/**
 * @param {{ values?: Record<string, number>, domain?: [number, number] }} spec
 * @returns {[number, number]}
 */
/**
 * Whether an element needs drawing: the first time, and whenever the key of what it shows differs
 * from the one it was last drawn with. Unchanged elements are left alone, so updates touch only
 * the elements whose data or state changed (eng §12) and an identical setData mutates nothing.
 * @param {any} el
 * @param {unknown[]} state
 */
function stale(el, state) {
  const key = JSON.stringify(state)
  if (el.__sgState === key) return false
  el.__sgState = key
  return true
}

function domainOf(spec) {
  if (spec.domain) return spec.domain
  const values = Object.values(spec.values ?? {}).filter(v => typeof v === 'number')
  return values.length ? [Math.min(...values), Math.max(...values)] : [0, 1]
}

/** @param {number} v @param {[number, number]|null} domain */
function normalise(v, domain) {
  const [lo, hi] = domain ?? [0, 1]
  if (hi === lo) return 1
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
}

/** @param {string} s */
function cssEscape(s) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&')
}
