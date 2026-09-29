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
 *   { type: 'move', items: [{ id, kind, x, y, w?, h?, parent }] }   (w, h: a resized group)
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
 * Gestures: click selects, Shift+click adds and Ctrl/⌘+click toggles; drag a shape to move it
 * (the selection moves together, frames bring their contents; it snaps to the grid, and to
 * smart guides within 6 screen px that are labelled with distances; Alt disables snapping);
 * drag a handle of a multi-selection's box to resize the group; drag from a port to connect;
 * drag the background for a selection rectangle (Shift adds); Space+drag or the middle button
 * to pan, the wheel to scroll, Ctrl/⌘+wheel or a pinch to zoom. Nothing moves until the host
 * answers an intent with setData.
 * Keyboard: Tab moves between shapes, Enter opens, Space selects, arrows move (Shift ×10),
 * Delete removes, Escape cancels or clears, Ctrl/⌘+A selects all, +/− zoom, 0 fits.
 *
 * Scale: the zoom bands of design system §6 decide what is drawn (below 75% no subtitles or
 * port dots, below 40% no badges or connection labels, below 15% blocks with system names
 * drawn large). An item with a `rev` is redrawn only when its rev changes. Pans move one
 * composited layer. Above 1,500 visible components the nodes are drawn on one Canvas 2D image,
 * and the spatial index finds the component under the pointer.
 */
import { GraphModel, DEFAULT_NODE_SIZE } from '../data.js'
import {
  boundaryAnchor,
  center,
  containsPoint,
  partAlong,
  pointAlong,
  expand,
  portAnchors,
  rectFromPoints,
  intersects,
  slideOut,
  snap,
  union,
} from '../geometry.js'
import { routeEdge } from '../routing.js'
import { SpatialIndex } from '../spatial.js'
import { guideGaps, snapMove } from '../snap.js'
import { align as alignItems, distribute as distributeItems } from '../arrange.js'
import { fitTransform, screenToWorld, visibleRect, zoomAt } from '../viewport.js'
import { truncateText, wrapText } from '../text.js'
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
  portRadius: 4,
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
/** Ports are hit within 12 px of their centre: a 24 px target (design system §6). */
const PORT_HIT_RADIUS = 12
/** How far apart parallel edges between the same two ends run. */
const PARALLEL_GAP = 10

/**
 * An edge end moved along its side (vertically for a side-less end), keeping its direction.
 * @template {{ x: number, y: number, side?: string|null }} A
 * @param {A} anchor @param {number} by
 * @returns {A}
 */
function slide(anchor, by) {
  if (!by) return anchor
  const along = anchor.side === 'top' || anchor.side === 'bottom' ? 'x' : 'y'
  return { ...anchor, [along]: anchor[along] + by }
}
const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const FRAME_RADIUS = 6
/** Request dots drawn at once, at most (design system §6). */
const MAX_DOTS = 400
/** What a stub marker's tooltip calls each stub mode (design system §6). */
const STUB_MODES = /** @type {Record<string, string>} */ ({
  fixed: 'Fixed',
  recorded: 'Recorded',
  'black-box': 'Black box',
})
/** The glyphs of the stub (a plug) and traffic (play) markers, in a 14 px box. */
const GLYPHS = /** @type {Record<string, string>} */ ({
  stub: 'M-3,-5v3M3,-5v3M-4,-2h8v2a4,4 0 0 1-8,0zM0,4v3',
  traffic: 'M-2,-4L4,0L-2,4Z',
})
/**
 * The token of design system §3's heat ramp for a utilisation from 0 to 1, or null below 50%,
 * where there is no tint.
 * @param {number} u
 */
const heatStep = u =>
  u < 0.5
    ? null
    : u < 0.7
      ? 'heatLow'
      : u < 0.85
        ? 'heatMid'
        : u < 0.95
          ? 'heatHigh'
          : 'heatCritical'
/** A short, stable hash of a string, for ids that must not depend on drawing order. */
const hash = (/** @type {string} */ s) =>
  ([...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 0) >>> 0).toString(36)
/** Above this many visible components the node layer is one Canvas 2D image (spec §10). */
const CANVAS_NODES = 1500

/**
 * The stratum colour of a level (design system §3): the root is 0, and deeper levels cycle
 * through 1 to 6.
 * @param {number} [level]
 */
const stratum = (level = 0) => (level > 0 ? ((Math.round(level) - 1) % 6) + 1 : 0)

/**
 * The 3 px stratum band along the top edge of a level frame with rounded corners (§5).
 * @param {Rect} r
 */
function bandPath(r) {
  const R = FRAME_RADIUS
  const inset = R - Math.sqrt(R * R - (R - 3) * (R - 3))
  const y = r.y + 3
  return `M${r.x + inset},${y}A${R},${R} 0 0 1 ${r.x + R},${r.y}H${r.x + r.w - R}A${R},${R} 0 0 1 ${r.x + r.w - inset},${y}Z`
}

/** A 10 × 12 padlock outline with its top-left corner at (x, y). */
const lockPath = (/** @type {number} */ x, /** @type {number} */ y) =>
  `M${x + 2.5},${y + 5}V${y + 3}a2.5,2.5 0 0 1 5,0V${y + 5}M${x + 1},${y + 5}h8v6h-8Z`
/** Boxes are never resized below this, in world units. */
const MIN_SIZE = 16
let instances = 0

/**
 * How a click changes the selection (design system §8): Shift adds, Mod toggles, and a plain
 * click replaces it.
 * @param {{ shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }|null|undefined} e
 * @returns {'add'|'toggle'|null}
 */
const selectMode = e => (e?.ctrlKey || e?.metaKey ? 'toggle' : e?.shiftKey ? 'add' : null)

/**
 * The parts of an edge's label pill: its label, then the method it calls, which draws in mono
 * (design system §6).
 * @param {{ label?: unknown, method?: unknown }} edge
 */
function labelParts(edge) {
  return [
    ...(edge.label ? [{ text: String(edge.label), cls: 'sg-edge-label-text' }] : []),
    ...(edge.method ? [{ text: String(edge.method), cls: 'sg-method' }] : []),
  ]
}

/** Where the resize handle for a direction such as 'nw' or 'e' sits on a rectangle. */
function handleAt(/** @type {Rect} */ r, /** @type {string} */ dir) {
  const x = dir.includes('w') ? r.x : dir.includes('e') ? r.x + r.w : r.x + r.w / 2
  const y = dir.includes('n') ? r.y : dir.includes('s') ? r.y + r.h : r.y + r.h / 2
  return { x, y }
}

/**
 * A rectangle with the sides a handle direction names dragged by (dx, dy): snapped to a grid
 * of `g` (0 for none), the opposite sides fixed, and never smaller than MIN_SIZE.
 * @param {Rect} r @param {string} dir @param {number} dx @param {number} dy @param {number} g
 * @returns {Rect}
 */
function dragSides(r, dir, dx, dy, g) {
  let x1 = r.x
  let y1 = r.y
  let x2 = r.x + r.w
  let y2 = r.y + r.h
  if (dir.includes('w')) x1 = Math.min(snap(r.x + dx, g), x2 - MIN_SIZE)
  if (dir.includes('e')) x2 = Math.max(snap(r.x + r.w + dx, g), x1 + MIN_SIZE)
  if (dir.includes('n')) y1 = Math.min(snap(r.y + dy, g), y2 - MIN_SIZE)
  if (dir.includes('s')) y2 = Math.max(snap(r.y + r.h + dy, g), y1 + MIN_SIZE)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

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
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #settle
  /** The zoom the canvas node layer was drawn at; 0 while nodes are SVG. */
  #canvasK = 0
  /** @type {string|null} the canvas-drawn component under the pointer */
  #canvasHover = null
  /** @type {string[]} the components on the canvas layer, in keyboard focus order */
  #canvasIds = []
  /** The components last lifted over the canvas layer (#liftedIds), joined. */
  #liftKey = ''
  /** @type {Map<string, [Path2D, boolean][]>} shape outlines for the canvas layer (#outline) */
  #outlines = new Map()
  /** The patterns the grid last drew, and the area its rectangles cover. */
  #gridKey = ''
  /** @type {(Rect & { k: number }) | null} */
  #gridCover = null
  #size = { width: 0, height: 0 }
  #index = new SpatialIndex(256)
  #portIndex = new SpatialIndex(128)
  /** @type {Map<string, { key: string, route: import('../routing.js').Route }>} */
  #routes = new Map()
  /** @type {any} transient gesture state */
  #drag = null
  #spaceDown = false
  /** @type {string|null} the component with keyboard focus */
  #focusedId = null
  #tokens
  #themeVersion = 0
  #measure
  #measureBold
  #measureSmall
  #measureMono
  /** Offsets of parallel edges, by edge id. @type {Map<string, number>} */
  #parallel = new Map()
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
      sizeOf: n => {
        const size = this.#shapeOf(n).size
        return (typeof size === 'function' ? size(n) : size) ?? DEFAULT_NODE_SIZE
      },
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
   * and those of design system §6:
   *   'heatmap'     utilisation from 0 to 1 draws the heat ramp as a tint from 50%, a 4 px bar
   *                 and, from 75% zoom, the percentage
   *   'requests'    { dots: [{ edge, t, failed? }] }  dots t (0 to 1) along edges, at most 400
   *   'followed'    { edge, t, trail?: edgeIds }  the followed request and the path it took
   *   'scope'       { ids, stubs?: { edgeId: 'fixed'|'recorded'|'black-box' },
   *                 sources?: { edgeId: label } }  outlines what runs, dims the rest to 30%, and
   *                 marks connections leaving (stubs) and entering (traffic) the scope
   *   'breakpoints' { values: { id: { conditional? } } }  a danger dot, "?" when conditional
   *   'hop'         { node?, edge? }  the component and connection being processed
   * @param {string} name
   * @param {any} spec
   */
  setOverlay(name, spec) {
    this.#overlays.set(name, spec)
    // Dots move every frame, so they redraw alone.
    if (name === 'requests' || name === 'followed') this.#renderOverlays(this.#layers)
    else this.#render()
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
    // Ids in the file do not depend on which graph drew it, so the same data exports the same
    // document (task 0208).
    const live = this.#uid
    this.#uid = 'strata'
    try {
      return this.#exportSVG(ids, padding, background)
    } finally {
      this.#uid = live
    }
  }

  /** @param {Iterable<string>|undefined} ids @param {number} padding @param {boolean} background */
  #exportSVG(ids, padding, background) {
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
    clearTimeout(this.#settle)
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
    const small = parseFloat(this.#tokens.fontSizeSmall) || this.#fontSize
    this.#measureSmall = createMeasurer(this.#tokens.fontFamily, small)
    this.#measureMono = createMeasurer(this.#tokens.fontFamilyMono, small)
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
      const id = this.#canvasNodeAt(world)
      this.#emitIntent({
        type: 'context',
        id,
        kind: id ? 'node' : null,
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
    // Arrowheads of design system §6, each also in the selected colour ('-active').
    /** @param {string} name @param {string} tag @param {Record<string, string|number>} attrs @param {number} [refX] */
    const marker = (name, tag, attrs, refX = 9) => {
      for (const active of ['', '-active']) {
        const m = svgEl(
          'marker',
          {
            id: `${this.#uid}-${name}${active}`,
            viewBox: '0 0 10 10',
            refX,
            refY: 5,
            markerWidth: 7,
            markerHeight: 7,
            orient: 'auto-start-reverse',
          },
          doc
        )
        const cls = `${attrs.class}${active ? ' sg-marker-active' : ''}`
        m.appendChild(svgEl(tag, { ...attrs, class: cls }, doc))
        defs.appendChild(m)
      }
    }
    marker('arrow', 'path', { d: 'M0,0 L10,5 L0,10 z', class: 'sg-arrow' })
    marker('arrow-open', 'path', { d: 'M1,1 L9,5 L1,9 z', class: 'sg-arrow-open' })
    marker('chevron', 'path', { d: 'M0,1 L4.5,5 L0,9 M5,1 L9.5,5 L5,9', class: 'sg-chevron' })
    // The source dot sits just outside the node, which is drawn over the edges.
    marker('dot', 'circle', { cx: 5, cy: 5, r: 2.7, class: 'sg-dot' }, 7.7)
    // Diagonal hatch for a missing component (design system §6).
    const hatch = svgEl(
      'pattern',
      {
        id: `${this.#uid}-hatch`,
        patternUnits: 'userSpaceOnUse',
        width: 8,
        height: 8,
        patternTransform: 'rotate(45)',
      },
      doc
    )
    hatch.appendChild(svgEl('rect', { class: 'sg-hatch-bg', width: 8, height: 8 }, doc))
    hatch.appendChild(svgEl('line', { class: 'sg-missing-hatch', x1: 0, y1: 0, x2: 0, y2: 8 }, doc))
    defs.appendChild(hatch)
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
   * so do the overlays: the large system names of the lowest zoom band, smart guides and
   * simulation tokens.
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
      names: overlays.append('g').attr('class', 'sg-names'),
      marks: overlays.append('g').attr('class', 'sg-marks'),
      followed: overlays.append('g').attr('class', 'sg-follow'),
      requests: overlays.append('g').attr('class', 'sg-requests'),
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
  /**
   * A pan moves the scene as one composited layer instead of repainting it, which keeps frames
   * within eng §15's 16 ms (task 0207). A zoom repaints at once so text stays sharp, and the layer
   * is released 200 ms after the last pan.
   * @param {boolean} pan
   */
  #panning(pan) {
    clearTimeout(this.#settle)
    this.#root?.classed('sg-moving', pan)
    if (pan) this.#settle = setTimeout(() => this.#root?.classed('sg-moving', false), 200)
  }

  /**
   * The zoom bands of design system §6: from 75% everything; below it subtitles and ports go,
   * below 40% badges and connection labels (icon and title only), and below 15% everything but
   * the blocks, with system names drawn large over their areas.
   * @param {number} k
   */
  #updateLod(k) {
    this.#svg
      .classed('sg-lod-mid', k < 0.75)
      .classed('sg-lod-low', k < 0.4)
      .classed('sg-lod-min', k < 0.15)
    if (k < 0.15) this.#layers.names?.selectAll('.sg-lod-name').style('font-size', this.#nameSize())
  }

  /** A system name's size in world units, so it draws at the title size on screen. */
  #nameSize() {
    return `${(parseFloat(this.#tokens.fontSizeTitle) || 16) / this.#transform.k}px`
  }

  #updateGrid() {
    const { grid, showGrid } = this.#opts
    const g = grid || 10
    const { k } = this.#transform
    const layer = this.#layers.grid
    layer.attr('visibility', showGrid ? 'visible' : 'hidden')
    if (!showGrid) return
    // Rewriting a pattern makes the browser redraw its tile, which costs more than a pan frame
    // (task 0207), so the patterns change only with the zoom or the grid, and the rectangles
    // they fill cover the view with a margin and move only when the view leaves it.
    const view = visibleRect(this.#transform, this.#size)
    const cover = this.#gridCover
    const inside =
      cover?.k === k &&
      view.x >= cover.x &&
      view.y >= cover.y &&
      view.x + view.w <= cover.x + cover.w &&
      view.y + view.h <= cover.y + cover.h
    const patterns = `${g},${k}`
    if (inside && this.#gridKey === patterns) return
    const area = inside && cover ? cover : { ...expand(view, Math.max(view.w, view.h) / 2), k }
    this.#gridCover = area
    const minorOpacity = Math.min(1, Math.max(0, (k - 0.25) / 0.25))
    const opacity = { minor: minorOpacity, major: g * 10 * k < 8 ? 0 : 1 }
    for (const [which, step, r] of /** @type {const} */ ([
      ['minor', g, 0.75],
      ['major', g * 10, 1.25],
    ])) {
      if (this.#gridKey !== patterns)
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
        .attr('x', area.x)
        .attr('y', area.y)
        .attr('width', area.w)
        .attr('height', area.h)
        .attr('visibility', opacity[which] > 0 ? 'visible' : 'hidden')
        .style('opacity', opacity[which])
    }
    this.#gridKey = patterns
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
        const was = this.#transform
        this.#panning(k === was.k && (x !== was.x || y !== was.y))
        this.#transform = { x, y, k }
        this.#root.attr('transform', `translate(${x},${y}) scale(${k})`)
        this.#updateLod(k)
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
        // A component drawn on the canvas layer: the same drag as on an SVG component.
        const at = screenToWorld(this.#transform, event)
        const hit = this.#canvasNodeAt(at)
        if (hit) {
          this.#drag = {
            type: 'move',
            id: hit,
            start: at,
            moved: false,
            mode: selectMode(e),
            delta: { x: 0, y: 0 },
            guides: [],
          }
          return
        }
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
        if (d?.type === 'move')
          return this.#moveDrag({
            ...screenToWorld(this.#transform, event),
            sourceEvent: event.sourceEvent,
          })
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
        if (d?.type === 'move') return this.#moveEnd()
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
    // Opening and hovering components on the canvas layer.
    const hitOf = event =>
      this.#canvasNodeAt(this.clientToWorld({ x: event.clientX, y: event.clientY }))
    this.#svg
      .on('dblclick.canvas', event => {
        const id = hitOf(event)
        if (id) this.#emitIntent({ type: 'open', id, kind: 'node' })
      })
      .on('pointermove.canvas', event => {
        const id = this.#canvasK
          ? (event.target.closest?.('.sg-node')?.getAttribute('data-id') ?? hitOf(event))
          : null
        if (id === this.#canvasHover) return
        this.#canvasHover = id
        this.#emit('hover', id ? { id, kind: 'node' } : null)
        this.#lift()
      })
  }

  /**
   * The components drawn in SVG over the canvas layer, so they have ports, focus and states like
   * any other: the one under the pointer, the focused one, and the ends of a connection being
   * drawn.
   */
  #liftedIds() {
    const d = this.#drag
    return new Set([
      this.#canvasHover,
      this.#focusedId,
      d?.source?.node,
      d?.target?.node,
      d?.refused?.node,
    ])
  }

  /**
   * Draws the lifted components again when they change. The canvas still draws them underneath,
   * so it needs no redraw.
   */
  #lift() {
    const lifted = this.#liftedIds()
    const key = [...lifted].join()
    if (!this.#canvasK || key === this.#liftKey) return
    this.#liftKey = key
    const m = this.#model
    this.#renderNodes(
      this.#layers.nodes,
      [...lifted]
        .map(id => m.nodes.get(/** @type {string} */ (id)))
        .filter(n => n && !m.isHidden(n)),
      true,
      this.#dimmed()
    )
  }

  /** The ids the highlight overlay keeps undimmed, or null without one. */
  #dimmed() {
    const highlight = this.#overlays.get('highlight')
    return highlight ? new Set(highlight.ids ?? []) : null
  }

  /**
   * The topmost component at a world point while components are drawn on the canvas layer,
   * found through the spatial index and tested against its exact rectangle; otherwise null.
   * @param {{ x: number, y: number }} p
   */
  #canvasNodeAt(p) {
    if (!this.#canvasK) return null
    const m = this.#model
    let hit = null
    for (const id of this.#index.query({ ...p, w: 0, h: 0 }, i => m.kindOf(i) === 'node'))
      if (containsPoint(this.#itemRect(id), p) && !m.isHidden(/** @type {any} */ (m.get(id))))
        hit = id
    return hit
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
          this.#clickSelect(id, selectMode(event))
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
      // On the canvas layer, Tab lifts the next component and focuses it.
      if (key === 'Tab' && this.#canvasK) {
        const ids = this.#canvasIds
        const id =
          ids[ids.indexOf(/** @type {string} */ (this.#focusedId)) + (event.shiftKey ? -1 : 1)]
        this.#focusedId = id ?? null
        if (!id) return
        event.preventDefault()
        this.#lift()
        this.focus(id)
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
    svg.addEventListener('focusin', event => {
      this.#focusedId =
        /** @type {any} */ (event.target).closest('.sg-node')?.getAttribute('data-id') ?? null
    })
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
      this.#shapes.get(node.shape ?? 'card') ??
      /** @type {import('./shapes.js').ShapeDef} */ (this.#shapes.get('card'))
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
    // Edges joining the same two ends, either way round, fan out so each stays visible.
    this.#parallel.clear()
    /** @type {Map<string, string[]>} */
    const pairs = new Map()
    for (const e of m.edges.values()) {
      if (e.waypoints.length) continue
      const key = [e.source, e.target]
        .map(end => `${end.node}\u0000${end.port ?? ''}`)
        .sort()
        .join('|')
      pairs.set(key, [...(pairs.get(key) ?? []), e.id])
    }
    for (const ids of pairs.values())
      if (ids.length > 1)
        ids.forEach((id, i) => this.#parallel.set(id, (i - (ids.length - 1) / 2) * PARALLEL_GAP))
  }

  /** An item's rectangle including any drag or resize in progress. @param {string} id @returns {Rect} */
  #itemRect(id) {
    const r = /** @type {Rect} */ (this.#model.rectOf(id))
    const d = this.#drag
    if (d?.type === 'move' && d.moved && d.idSet?.has(id))
      return { ...r, x: r.x + d.delta.x, y: r.y + d.delta.y }
    if (d?.type === 'resize' && d.id === id && d.rect) return d.rect
    if (d?.type === 'group-resize' && d.rects?.has(id)) return d.rects.get(id)
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
    const shift = waypoints.length ? 0 : (this.#parallel.get(edge.id) ?? 0)
    const source = slide(this.#anchor(edge.source, waypoints[0] ?? center(tRect)), shift)
    const target = slide(
      this.#anchor(edge.target, waypoints[waypoints.length - 1] ?? center(sRect)),
      shift
    )
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
    // Every item of the arrangement, when any of them moves: the host applies it as one step.
    const placed = fn(items)
    const moved = placed.some(p => {
      const r = m.rectOf(p.id)
      return r && (r.x !== p.x || r.y !== p.y)
    })
    if (!moved) return
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

  /** @param {string} id @param {'add'|'toggle'|null} mode from selectMode */
  #clickSelect(id, mode) {
    const s = this.#selection
    if (mode === 'add' && s.has(id)) return
    const ids = !mode ? [id] : s.has(id) ? [...s].filter(x => x !== id) : [...s, id]
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
          mode: selectMode(e),
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
    d.gaps = []
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
      d.gaps = guideGaps({ ...proposed, x, y }, near, snapped.guides)
    }
    d.delta = { x: x - d.primary.x, y: y - d.primary.y }
    this.#render()
  }

  #moveEnd() {
    const d = this.#drag
    if (d?.type !== 'move') return
    this.#drag = null
    if (!d.moved) {
      this.#clickSelect(d.id, d.mode)
      this.#render()
      return
    }
    if (d.delta.x !== 0 || d.delta.y !== 0) {
      const to = r => ({ ...r, x: r.x + d.delta.x, y: r.y + d.delta.y })
      this.#emitIntent({ type: 'move', items: this.#placed(d.ids, to, false) })
    }
    this.#render()
  }

  /**
   * Items of a move intent for boxes going to new rectangles. A box whose parent goes with it
   * keeps that parent; any other lands in the frame under its centre.
   * @param {string[]} ids
   * @param {(r: Rect, id: string) => Rect} to the new rectangle of each box
   * @param {boolean} sized whether the items carry their new sizes
   */
  #placed(ids, to, sized) {
    const m = this.#model
    const idSet = new Set(ids)
    const frames = ids.filter(id => m.kindOf(id) === 'frame')
    return ids.map(id => {
      const next = to(/** @type {Rect} */ (m.rectOf(id)), id)
      const item = /** @type {any} */ (m.get(id))
      const carried = item.parent && idSet.has(item.parent)
      const parent = carried ? item.parent : m.frameAt(center(next), new Set(frames))
      const size = sized ? { w: next.w, h: next.h } : {}
      return { id, kind: m.kindOf(id), x: next.x, y: next.y, ...size, parent: parent ?? null }
    })
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
        d.refused = d.target ? null : this.#refusedTarget(d.pointer, d.source, d.reverse)
        this.#lift()
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
        this.#lift()
        this.#renderHandles()
      }))
  }

  /**
   * Whether a connection from `source` may end on `target`: true, or the reason it may not
   * ('' when there is none to give). A host's `canConnect` returns true, false, or the reason
   * as a string.
   * @returns {true|string}
   */
  #verdict(source, target, reverse) {
    if (target.node === source.node && target.port === source.port) return ''
    const [s, t] = reverse ? [target, source] : [source, target]
    if (this.#opts.canConnect) {
      const v = this.#opts.canConnect(s, t)
      return typeof v === 'string' ? v : v ? true : ''
    }
    if (s.node === t.node) return ''
    return s.spec?.direction !== 'in' && t.spec?.direction !== 'out' ? true : ''
  }

  /**
   * The port of another node under the pointer that a connection may not end on, with the
   * reason, so it can show the invalid state; null when there is none.
   */
  #refusedTarget(point, source, reverse) {
    const m = this.#model
    const near = this.#portIndex.nearest(point, 14 / this.#transform.k, key => {
      const [node] = key.split('\u0000')
      return node !== source.node && !m.nodes.get(node)?.ghost
    })
    if (!near) return null
    const [node, port] = near.split('\u0000')
    const target = { node, port, spec: m.nodes.get(node)?.ports.find(q => q.id === port) }
    const verdict = this.#verdict(source, target, reverse)
    return verdict === true ? null : { node, port, reason: verdict }
  }

  /**
   * The port a connection gesture would end on: a port near the pointer, else the first
   * suitable port of the node under it.
   */
  #connectTarget(point, source, reverse) {
    const m = this.#model
    const allowed = target => this.#verdict(source, target, reverse) === true
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
        const g = this.#opts.snap && !event.sourceEvent?.altKey ? this.#opts.grid : 0
        d.rect = dragSides(d.rect0, d.dir, event.x - d.start.x, event.y - d.start.y, g)
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

  /**
   * Dragging a handle of a multi-selection's box scales every box in it away from the opposite
   * side, and the drop is one move intent whose items carry their new sizes.
   */
  #groupResizeDragBehavior() {
    if (this.#behaviors.groupResize) return this.#behaviors.groupResize
    const d3 = this.#d3
    return (this.#behaviors.groupResize = d3
      .drag()
      .filter(event => event.button === 0 && !this.#opts.readOnly)
      .container(() => this.#root.node())
      .subject(event => ({ x: event.x, y: event.y }))
      .on('start', (event, h) => {
        event.sourceEvent?.stopPropagation()
        const rects0 = new Map(h.ids.map(id => [id, this.#model.rectOf(id)]))
        this.#drag = {
          type: 'group-resize',
          dir: h.dir,
          start: { x: event.x, y: event.y },
          ids: h.ids,
          rects0,
          box0: union([...rects0.values()]),
          rects: null,
        }
      })
      .on('drag', event => {
        const d = this.#drag
        if (d?.type !== 'group-resize') return
        const g = this.#opts.snap && !event.sourceEvent?.altKey ? this.#opts.grid : 0
        const b0 = d.box0
        const b = dragSides(b0, d.dir, event.x - d.start.x, event.y - d.start.y, g)
        const sx = b0.w ? b.w / b0.w : 1
        const sy = b0.h ? b.h / b0.h : 1
        d.rects = new Map()
        for (const [id, r] of d.rects0)
          d.rects.set(id, {
            x: Math.round(b.x + (r.x - b0.x) * sx),
            y: Math.round(b.y + (r.y - b0.y) * sy),
            w: Math.max(MIN_SIZE, Math.round(r.w * sx)),
            h: Math.max(MIN_SIZE, Math.round(r.h * sy)),
          })
        this.#render()
      })
      .on('end', () => {
        const d = this.#drag
        this.#drag = null
        if (d?.type === 'group-resize' && d.rects) {
          const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
          if (d.ids.some(id => !same(d.rects.get(id), d.rects0.get(id))))
            this.#emitIntent({
              type: 'move',
              items: this.#placed(d.ids, (_, id) => d.rects.get(id), true),
            })
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
          d.refused = d.target ? null : this.#refusedTarget(d.pointer, d.fixed, d.end === 'source')
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
    const blurred = !!this.#canvasK && Math.abs(this.#transform.k / this.#canvasK - 1) > 0.25
    if (
      !blurred &&
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

    const dim = this.#dimmed()
    this.#renderFrames(L.frames, frames, interactive, dim)
    this.#renderAnnotations(
      L.regions,
      annotations.filter(a => a.kind === 'region'),
      interactive,
      dim
    )
    this.#renderEdges(L.edges, edges, interactive, dim)
    const canvas = interactive && nodes.length > CANVAS_NODES
    const lifted = this.#liftedIds()
    if (interactive) this.#liftKey = [...lifted].join()
    this.#renderNodes(
      L.nodes,
      canvas ? nodes.filter(n => lifted.has(n.id)) : nodes,
      interactive,
      dim
    )
    if (interactive) this.#drawCanvas(L.nodes, canvas ? nodes : null, area)
    // System names, drawn large over their areas and above every block below 15% zoom
    // (design system §6).
    L.names
      ?.selectChildren('text.sg-lod-name')
      .data(
        nodes.filter(n => n.composite && n.label),
        d => d.id
      )
      .join(enter => enter.append('text').attr('class', 'sg-lod-name'))
      .filter((d, i, els) => stale(els[i], [d.label, this.#itemRect(d.id), this.#nameSize()]))
      .style('font-size', this.#nameSize())
      .attr('x', d => center(this.#itemRect(d.id)).x)
      .attr('y', d => center(this.#itemRect(d.id)).y)
      .text(d => d.label)
    this.#renderOverlays(L)
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
        stale(nodes[i], [revOf(d), this.#itemRect(d.id), selected(d), m.isLocked(d), dimmed(d)])
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
        .attr('rx', FRAME_RADIUS)
        .style('stroke', d.style?.stroke ?? null)
        .style('fill', d.style?.fill ?? null)
      // The level frame's stratum band (design system §5) and a trust boundary's lock (§6).
      g.selectChildren('path.sg-stratum-band')
        .data(d.kind === 'system' ? [stratum(d.level)] : [])
        .join('path')
        .attr('class', n => `sg-stratum-band sg-level-${n}`)
        .attr('d', bandPath(r))
      const trust = d.kind === 'trust-boundary'
      g.selectChildren('path.sg-frame-lock')
        .data(trust ? [r] : [])
        .join('path')
        .attr('class', 'sg-frame-lock')
        .attr('d', b => lockPath(b.x + 10, b.y + 7))
      g.select('.sg-frame-label')
        .attr('x', r.x + (trust ? 26 : 10))
        .attr('y', r.y + (d.kind === 'system' ? 12 : 8))
        .text(trust ? `Trust boundary${d.label ? `: ${d.label}` : ''}` : (d.label ?? ''))
      g.select('.sg-frame-title').attr('x', r.x).attr('y', r.y).attr('width', r.w)
    })
  }

  /** The components a scoped run covers, or null outside one. */
  #scopeIds() {
    const ids = this.#overlays.get('scope')?.ids
    return ids ? new Set(ids) : null
  }

  /**
   * What simulation and debugging draw over the scene (design system §6): request dots, at most
   * 400 and only those in view; the followed request with its trail; and the stub and traffic
   * markers where a scoped run's connections leave or enter the scope.
   * @param {Record<string, any>} L
   */
  #renderOverlays(L) {
    if (!L.marks) return
    const m = this.#model
    const pointsOf = (/** @type {string} */ id) => {
      const e = m.edges.get(id)
      return e && !m.isHidden(e) ? this.#routeOf(e).points : null
    }
    const scope = this.#scopeIds()
    const spec = this.#overlays.get('scope')
    const marks = []
    for (const e of scope ? m.edges.values() : []) {
      const leaves = scope?.has(e.source.node)
      const pts = leaves !== scope?.has(e.target.node) && pointsOf(e.id)
      if (!pts) continue
      marks.push(
        leaves
          ? {
              key: `s${e.id}`,
              kind: 'stub',
              at: pts[pts.length - 1],
              title: `Stub: ${STUB_MODES[spec.stubs?.[e.id]] ?? STUB_MODES.fixed}`,
              text: '',
            }
          : {
              key: `t${e.id}`,
              kind: 'traffic',
              at: pts[0],
              title: '',
              text: spec.sources?.[e.id] ?? '',
            }
      )
    }
    L.marks
      .selectChildren('g')
      .data(marks, (/** @type {any} */ d) => d.key)
      .join((/** @type {any} */ enter) => {
        const g = enter.append('g')
        for (const tag of ['title', 'rect', 'path', 'text']) g.append(tag)
        return g
      })
      .attr('class', (/** @type {any} */ d) => `sg-${d.kind}`)
      .attr('transform', (/** @type {any} */ d) => `translate(${d.at.x},${d.at.y})`)
      .call((/** @type {any} */ g) =>
        g.select('title').text((/** @type {any} */ d) => d.title || d.text)
      )
      .call((/** @type {any} */ g) =>
        g
          .select('rect')
          .attr('x', -7)
          .attr('y', -7)
          .attr('width', 14)
          .attr('height', 14)
          .attr('rx', (/** @type {any} */ d) => (d.kind === 'traffic' ? 7 : 2))
      )
      .call((/** @type {any} */ g) =>
        g.select('path').attr('d', (/** @type {any} */ d) => GLYPHS[d.kind])
      )
      .call((/** @type {any} */ g) =>
        g
          .select('text')
          .attr('y', -12)
          .text((/** @type {any} */ d) => d.text)
      )
    const view = expand(visibleRect(this.#transform, this.#size), 8)
    const dots = []
    for (const dot of this.#overlays.get('requests')?.dots ?? []) {
      if (dots.length >= MAX_DOTS) break
      const pts = pointsOf(dot.edge)
      const at = pts && pointAlong(pts, dot.t)
      if (at && containsPoint(view, at)) dots.push({ ...at, failed: !!dot.failed })
    }
    L.requests
      .selectChildren('circle')
      .data(dots)
      .join('circle')
      .attr('class', (/** @type {any} */ d) =>
        d.failed ? 'sg-request sg-request-failed' : 'sg-request'
      )
      .attr('cx', (/** @type {any} */ d) => d.x)
      .attr('cy', (/** @type {any} */ d) => d.y)
      .attr('r', 2)
    // The trail follows each connection taken, not the gaps between them inside components.
    const f = this.#overlays.get('followed')
    const current = f && pointsOf(f.edge)
    const legs = current
      ? [
          ...(f.trail ?? []).map((/** @type {string} */ id) => pointsOf(id)).filter(Boolean),
          partAlong(current, f.t),
        ]
      : []
    const line = (/** @type {any[]} */ p) => `M${p.map(q => `${q.x},${q.y}`).join('L')}`
    L.followed
      .selectChildren('path')
      .data(legs.length ? [legs.map(line).join('')] : [])
      .join('path')
      .attr('class', 'sg-trail')
      .attr('d', (/** @type {string} */ d) => d)
    L.followed
      .selectChildren('circle')
      .data(current ? [legs[legs.length - 1].at(-1)] : [])
      .join('circle')
      .attr('class', 'sg-followed')
      .attr('cx', (/** @type {any} */ p) => p.x)
      .attr('cy', (/** @type {any} */ p) => p.y)
      .attr('r', 4)
  }

  /**
   * Above 1,500 visible components the node layer is one Canvas 2D image (spec §10, eng §12). It
   * covers the rendered area, is drawn at the current zoom, and pointer events reach the
   * background, where the spatial index finds the component under them (#canvasNodeAt). Each
   * component draws its shape's outline (#outline), its title, and the heat, breakpoint, scope and
   * hop overlays as the SVG layer does. Lifted components (#liftedIds) are drawn again in SVG
   * above it.
   * @param {any} layer
   * @param {any[]|null} nodes null when the nodes are SVG
   * @param {Rect|null} area
   */
  #drawCanvas(layer, nodes, area) {
    const on = !!nodes && !!area
    this.#canvasK = on ? this.#transform.k : 0
    this.#canvasIds = on ? nodes.filter(n => !n.ghost).map(n => n.id) : []
    const box = layer
      .selectChildren('foreignObject.sg-node-layer')
      .data(on ? [area] : [])
      .join(enter => {
        const f = enter.insert('foreignObject', ':first-child').attr('class', 'sg-node-layer')
        f.append('xhtml:canvas').attr('class', 'sg-node-canvas')
        return f
      })
    if (!nodes || !area) return
    const k = this.#transform.k
    const dpr = Math.min(2, this.#host.ownerDocument?.defaultView?.devicePixelRatio || 1)
    const s = k * dpr
    box.attr('x', area.x).attr('y', area.y).attr('width', area.w).attr('height', area.h)
    const canvas = /** @type {HTMLCanvasElement} */ (
      box.select('canvas').style('width', `${area.w}px`).style('height', `${area.h}px`).node()
    )
    canvas.width = Math.ceil(area.w * s)
    canvas.height = Math.ceil(area.h * s)
    const main = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    // Components outside a scoped run fade to 30% as a whole, as SVG groups do: they draw on a
    // second canvas, laid under the others at that opacity.
    /** @type {CanvasRenderingContext2D|undefined} */
    let faded
    const t = this.#tokens
    const radius = Number(t.radius) || 0
    const titles = k >= 0.15 && k * this.#fontSize >= 4
    const font = `600 ${this.#fontSize}px ${t.fontFamily}`
    const heat = this.#overlays.get('heatmap')
    const domain = heat ? domainOf(heat) : null
    const scope = this.#scopeIds()
    const breakpoints = this.#overlays.get('breakpoints')?.values
    const hop = this.#overlays.get('hop')
    for (const d of nodes) {
      const r = this.#itemRect(d.id)
      const selected = this.#selection.has(d.id)
      const ctx =
        d.outOfScope || (scope && !scope.has(d.id))
          ? (faded ??= /** @type {any} */ (canvas.cloneNode()).getContext('2d'))
          : main
      ctx.setTransform(s, 0, 0, s, (r.x - area.x) * s, (r.y - area.y) * s)
      ctx.textBaseline = 'middle'
      ctx.lineWidth = (selected ? 2 : 1) / k
      ctx.strokeStyle = selected ? t.accent : t.nodeStroke
      ctx.fillStyle = t.nodeFill
      for (const [path, detail] of this.#outline(d, r)) {
        if (!detail) ctx.fill(path)
        ctx.stroke(path)
      }
      if (titles && d.label) {
        ctx.font = font
        ctx.textAlign = 'start'
        ctx.fillStyle = t.nodeText
        ctx.fillText(truncateText(d.label, r.w - 16, this.#measureBold), 8, r.h / 2)
      }
      // Utilisation: a tint from 50%, a 4 px bar and a danger mark from 95% (see #renderNodes).
      const hv = heat?.values?.[d.id]
      if (typeof hv === 'number') {
        const u = normalise(hv, domain)
        const step = heatStep(u)
        ctx.fillStyle = step ? t[step] : t.port
        ctx.globalAlpha = 0.4
        if (step) this.#fillRound(ctx, 0, 0, r.w, r.h, radius)
        ctx.globalAlpha = 1
        ctx.fillRect(0, r.h - 4, r.w * u, 4)
        ctx.fillStyle = t.danger
        if (u >= 0.95) this.#fillRound(ctx, 4, r.h - 16, 10, 10, 3)
      }
      // A breakpoint's dot at the top-left corner, "?" when conditional.
      const bp = breakpoints?.[d.id]
      if (bp) {
        ctx.fillStyle = t.danger
        ctx.beginPath()
        ctx.arc(0, 0, 5, 0, 7)
        ctx.fill()
        if (bp.conditional) {
          ctx.font = `700 8px ${t.fontFamily}`
          ctx.textAlign = 'center'
          ctx.fillStyle = t.badgeText
          ctx.fillText('?', 0, 0)
        }
      }
      // The outlines of the component being processed and of each component in a scoped run.
      ctx.strokeStyle = t.accent
      for (const [ring, o, width, dash] of /** @type {const} */ ([
        [hop?.node === d.id, 3, 2, []],
        [scope?.has(d.id), 6, 1.5, [4, 3]],
      ]))
        if (ring) {
          ctx.lineWidth = width
          ctx.setLineDash(dash)
          ctx.beginPath()
          ctx.roundRect(-o, -o, r.w + 2 * o, r.h + 2 * o, radius + o)
          ctx.stroke()
          ctx.setLineDash([])
        }
    }
    if (!faded) return
    main.setTransform(1, 0, 0, 1, 0, 0)
    main.globalAlpha = 0.3
    main.globalCompositeOperation = 'destination-over'
    main.drawImage(faded.canvas, 0, 0)
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} radius
   */
  #fillRound(ctx, x, y, w, h, radius) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, radius)
    ctx.fill()
  }

  /**
   * A component's shape on the canvas layer, as paths in its own coordinates, each with whether
   * it is a detail line drawn without a fill. The shape draws once into a detached group at the
   * component's size, and its outline, strata and detail elements become the paths, so every
   * shape, a host's too, has the same outline on both layers.
   * @param {any} d @param {Rect} r
   */
  #outline(d, r) {
    const key = JSON.stringify([d.shape, r.w, r.h, !!d.composite, d.side, this.#themeVersion])
    let parts = this.#outlines.get(key)
    if (!parts) {
      if (this.#outlines.size > 500) this.#outlines.clear()
      const g = this.#d3.create('svg:g')
      this.#shapeOf(d).render(g, { ...d, w: r.w, h: r.h }, this.#shapeContext())
      parts = g
        .selectAll('.sg-shape, .sg-stratum, .sg-bp-disc')
        .nodes()
        .map((/** @type {Element} */ el) => {
          const a = (/** @type {string} */ name) => Number(el.getAttribute(name)) || 0
          const path = new Path2D(el.getAttribute('d') ?? '')
          if (el.localName === 'rect')
            path.roundRect(a('x'), a('y'), a('width'), a('height'), a('rx'))
          if (/^(circle|ellipse)$/.test(el.localName))
            path.ellipse(a('cx'), a('cy'), a('rx') || a('r'), a('ry') || a('r'), 0, 0, 7)
          return /** @type {[Path2D, boolean]} */ ([path, el.getAttribute('fill') === 'none'])
        })
      this.#outlines.set(key, parts)
    }
    return parts
  }

  /** What a shape draws with (shapes.js). @returns {import('./shapes.js').ShapeContext} */
  #shapeContext() {
    return {
      theme: this.#tokens,
      radius: Number(this.#tokens.radius) || 0,
      fontSize: this.#fontSize,
      measure: this.#measure,
      measureBold: this.#measureBold,
      icon: markup => this.#icon(markup)?.cloneNode(true) ?? null,
    }
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
    enter.append('g').attr('class', 'sg-content')
    enter.append('g').attr('class', 'sg-decor')
    enter.append('g').attr('class', 'sg-ports')
    if (interactive) this.#bindItem(enter, 'node')
    const heat = this.#overlays.get('heatmap')
    const badges = this.#overlays.get('badges')
    const heatDomain = heat ? domainOf(heat) : null
    const scope = this.#scopeIds()
    const breakpoints = this.#overlays.get('breakpoints')?.values
    const hop = this.#overlays.get('hop')
    const radius = Number(this.#tokens.radius) || 0
    const target =
      this.#drag?.type === 'connect' || this.#drag?.type === 'reconnect' ? this.#drag.target : null
    const all = enter
      .merge(sel)
      .filter((d, i, groups) =>
        stale(groups[i], [
          revOf(d),
          this.#itemRect(d.id),
          interactive,
          interactive && this.#selection.has(d.id),
          m.isLocked(d),
          !!dim && !dim.has(d.id),
          heat?.values?.[d.id] ?? null,
          heat ? heatDomain : null,
          badges?.values?.[d.id] ?? null,
          scope ? scope.has(d.id) : null,
          breakpoints?.[d.id] ?? null,
          hop?.node === d.id,
          target?.node === d.id ? target.port : null,
          this.#dragged(d.id),
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
      .classed('sg-status-planned', d => d.status === 'planned')
      .classed('sg-status-deprecated', d => d.status === 'deprecated')
      .classed('sg-failing', d => !!d.failing)
      .classed('sg-out-of-scope', d => !!d.outOfScope || (!!scope && !scope.has(d.id)))
      .classed('sg-dragging', d => this.#dragged(d.id))
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
    const portDrag = interactive ? this.#portDragBehavior() : null
    all.each((d, i, groups) => {
      const g = this.#d3.select(groups[i])
      const r = this.#itemRect(d.id)
      // The full name, as a tooltip (design system §6: titles are truncated on the card).
      const changes = Array.isArray(d.runChanges) ? d.runChanges : []
      const tooltip = [
        d.label,
        d.missing ? `Missing: ${d.missing}` : '',
        ...(changes.length ? ['Run-only changes:', ...changes] : []),
      ]
      g.selectChildren('title')
        .data(d.label ? [tooltip.filter(Boolean).join('\n')] : [])
        .join(enter => enter.insert('title', ':first-child'))
        .text(t => t)
      this.#renderNodeBody(g, d, r)

      // Ports
      const anchors = portAnchors({ x: 0, y: 0, w: r.w, h: r.h }, d.ports)
      const ports = d.ports.map(p => ({ ...p, node: d.id, a: anchors.get(p.id) }))
      // Each port draws at 8 px and is hit within 24 px (design system §6).
      const psel = g
        .select('.sg-ports')
        .selectChildren('g.sg-port')
        .data(ports, p => p.id)
      psel.exit().remove()
      const penter = psel.enter().append('g').attr('class', 'sg-port')
      penter.append('title')
      penter.append('circle').attr('class', 'sg-port-hit').attr('r', PORT_HIT_RADIUS)
      penter.append('circle').attr('class', 'sg-port-dot')
      penter.append('circle').attr('class', 'sg-port-ring').attr('r', 8)
      if (portDrag && !d.ghost) penter.call(portDrag)
      const pall = penter
        .merge(psel)
        .attr('transform', p => `translate(${p.a.x},${p.a.y})`)
        .attr('data-port', p => p.id)
      pall.select('.sg-port-dot').attr('r', this.#opts.portRadius)
      pall
        .classed('sg-port-target', p => !!target && target.node === d.id && target.port === p.id)
        .select('title')
        .text(p => p.label ?? p.id)

      // Overlays: heat tint and badge
      const decor = g.select('.sg-decor')
      // Utilisation (design system §6): the heat ramp of §3 as a tint from 50%, a 4 px bar along
      // the bottom edge and, from 75% zoom, the percentage, with a danger mark from 95%.
      const hv = heat?.values?.[d.id]
      decor
        .selectChildren('g.sg-heat')
        .data(typeof hv === 'number' ? [normalise(hv, heatDomain)] : [])
        .join(enter => {
          const h = enter.append('g').attr('class', 'sg-heat')
          for (const part of ['tint', 'bar', 'alert'])
            h.append('rect').attr('class', `sg-heat-${part}`)
          h.append('text').attr('class', 'sg-heat-label')
          return h
        })
        .each((u, j, els) => {
          const h = this.#d3.select(els[j])
          const step = heatStep(u)
          const fill = step ? this.#tokens[step] : this.#tokens.port
          h.select('.sg-heat-tint')
            .attr('display', step ? null : 'none')
            .attr('width', r.w)
            .attr('height', r.h)
            .attr('rx', radius)
            .attr('fill', fill)
          h.select('.sg-heat-bar')
            .attr('y', r.h - 4)
            .attr('width', r.w * u)
            .attr('height', 4)
            .attr('fill', fill)
          // The danger octagon of design system §3, as a 10 px square cut at the corners.
          h.select('.sg-heat-alert')
            .attr('display', u >= 0.95 ? null : 'none')
            .attr('x', 4)
            .attr('y', r.h - 16)
            .attr('width', 10)
            .attr('height', 10)
            .attr('rx', 3)
          h.select('.sg-heat-label')
            .attr('x', r.w - 4)
            .attr('y', r.h - 8)
            .text(`${Math.round(u * 100)}%`)
        })
      // Debugging (design system §6): a breakpoint's danger dot at the top-left corner, "?" when
      // conditional; the outline of the component being processed; and, in a scoped run, the
      // dashed outline of each component that runs.
      const bp = breakpoints?.[d.id]
      decor
        .selectChildren('g.sg-breakpoint')
        .data(bp ? [bp] : [])
        .join(enter => {
          const b = enter.append('g').attr('class', 'sg-breakpoint')
          b.append('circle').attr('r', 5)
          b.append('text')
          return b
        })
        .select('text')
        .text(b => (b.conditional ? '?' : ''))
      const rings = [
        ...(hop?.node === d.id ? [['sg-hop-outline', 3]] : []),
        ...(scope?.has(d.id) ? [['sg-scope-outline', 6]] : []),
      ]
      decor
        .selectChildren('rect.sg-ring')
        .data(rings, ring => ring[0])
        .join('rect')
        .attr('class', ([c]) => `sg-ring ${c}`)
        .attr('x', ([, o]) => -o)
        .attr('y', ([, o]) => -o)
        .attr('width', ([, o]) => r.w + 2 * o)
        .attr('height', ([, o]) => r.h + 2 * o)
        .attr('rx', ([, o]) => radius + o)
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
      this.#renderNodeStates(decor, d, r)
    })
  }

  /** True for a node being dragged right now. @param {string} id */
  #dragged(id) {
    const d = this.#drag
    return !!(d?.type === 'move' && d.moved && d.idSet?.has(id))
  }

  /**
   * The decorations of design system §6's node states, in node coordinates: the selection halo,
   * the keyboard focus ring, a lock for a read-only placement, a "Deprecated" chip, an error
   * badge for a failing component, and a warning dot for run-only changes.
   * @param {any} decor @param {any} d @param {Rect} r
   */
  #renderNodeStates(decor, d, r) {
    const radius = Number(this.#tokens.radius) || 0
    for (const cls of ['sg-halo', 'sg-focus-ring'])
      decor
        .selectChildren(`rect.${cls}`)
        .data([cls])
        .join('rect')
        .attr('class', cls)
        .attr('x', -3)
        .attr('y', -3)
        .attr('width', r.w + 6)
        .attr('height', r.h + 6)
        .attr('rx', radius + 3)
    decor
      .selectChildren('path.sg-lock')
      .data(d.readOnly ? [0] : [])
      .join('path')
      .attr('class', 'sg-lock')
      .attr('transform', `translate(${r.w - 17},${r.h - 17})`)
      .attr('d', 'M2,6 h8 v6 h-8 Z M4,6 V4 a2,2 0 0 1 4,0 V6')
    const chipWidth = this.#measure('Deprecated') + 12
    const chip = decor
      .selectChildren('g.sg-chip')
      .data(d.status === 'deprecated' ? ['Deprecated'] : [])
      .join(enter => {
        const g = enter.append('g').attr('class', 'sg-chip')
        g.append('rect').attr('height', 16).attr('rx', 8)
        g.append('text').attr('y', 8)
        return g
      })
      .attr('transform', 'translate(12,-8)')
    chip.select('rect').attr('width', chipWidth)
    chip
      .select('text')
      .attr('x', chipWidth / 2)
      .text(t => t)
    decor
      .selectChildren('g.sg-error-badge')
      .data(d.failing ? ['!'] : [])
      .join(enter => {
        const g = enter.append('g').attr('class', 'sg-error-badge')
        g.append('circle').attr('r', 8)
        g.append('text')
        return g
      })
      .attr('transform', `translate(${r.w},0)`)
      .select('text')
      .text(t => t)
    decor
      .selectChildren('circle.sg-run-change')
      .data(Array.isArray(d.runChanges) && d.runChanges.length ? [0] : [])
      .join('circle')
      .attr('class', 'sg-run-change')
      .attr('cx', r.w - 8)
      .attr('cy', 8)
      .attr('r', 3)
  }

  /**
   * The node's body through its shape's `render`, and the label and icon the graph draws for
   * shapes that do not draw their own. Both update in place (spec §10); a node whose shape
   * changes starts from an empty body.
   */
  #renderNodeBody(g, d, r) {
    const key = JSON.stringify([
      d.shape,
      r.w,
      r.h,
      d.label,
      d.sublabel,
      d.icon,
      d.style,
      d.badges,
      !!d.composite,
      d.missing ?? null,
      this.#themeVersion,
    ])
    const node = g.node()
    if (node.__sgKey === key) return
    node.__sgKey = key
    const body = g.select('.sg-body')
    const shapeName = d.shape ?? 'card'
    if (node.__sgShape !== shapeName) body.selectChildren().remove()
    node.__sgShape = shapeName
    const shape = this.#shapeOf(d)
    const dd = { ...d, w: r.w, h: r.h }
    shape.render(body, dd, this.#shapeContext())
    const style = d.style ?? {}
    body
      .selectAll('.sg-shape')
      .style('fill', d.missing ? `url(#${this.#uid}-hatch)` : (style.fill ?? null))
      .style('stroke', style.stroke ?? null)
      .style('stroke-dasharray', style.dash ?? null)
    body.style('opacity', style.opacity ?? null)

    // What the graph draws inside the shape's label box: an icon, the label and a sublabel.
    const content = g.select('.sg-content')
    const own = shape.label !== false
    let box = shape.labelBox?.(dd) ?? { x: 6, y: 4, w: dd.w - 12, h: dd.h - 8 }
    const iconSize = Math.max(10, Math.min(18, box.h - 4))
    const icon = own && d.icon ? this.#icon(d.icon) : null
    content
      .selectChildren('svg.sg-icon')
      .data(icon ? [d.icon] : [], m => m)
      .join(enter => enter.append(() => /** @type {Element} */ (icon).cloneNode(true)))
      .attr('class', 'sg-icon')
      .attr('x', box.x)
      .attr('y', box.h > 40 ? box.y + 2 : box.y + (box.h - iconSize) / 2)
      .attr('width', iconSize)
      .attr('height', iconSize)
    // Inside the label box, so it stays within curved and slanted outlines too.
    if (icon) box = { ...box, x: box.x + iconSize + 2, w: Math.max(10, box.w - iconSize - 2) }
    const lineH = this.#fontSize * 1.25
    const sub = own && d.label && d.sublabel ? 1 : 0
    const maxLines = Math.max(1, Math.floor(box.h / lineH) - sub)
    const lines = own && d.label ? wrapText(d.label, box.w, this.#measureBold, { maxLines }) : []
    const cx = box.x + box.w / 2
    const top = box.y + box.h / 2 - ((lines.length + sub) * lineH) / 2 + lineH / 2
    content
      .selectChildren('text.sg-label')
      .data(lines.length ? [lines] : [])
      .join('text')
      .attr('class', 'sg-label')
      .selectChildren('tspan')
      .data(l => l)
      .join('tspan')
      .attr('x', cx)
      .attr('y', (_, i) => top + i * lineH)
      .text(line => line)
    content
      .selectChildren('text.sg-sublabel')
      .data(sub ? wrapText(d.sublabel, box.w, this.#measure, { maxLines: 1 }) : [])
      .join('text')
      .attr('class', 'sg-sublabel')
      .attr('x', cx)
      .attr('y', top + lines.length * lineH)
      .text(t => t)
  }

  #icon(markup) {
    const key = `${this.#uid} ${markup}`
    if (!this.#iconCache.has(key))
      this.#iconCache.set(key, sanitizeSvg(markup, `${this.#uid}-i${hash(markup)}`))
    return this.#iconCache.get(key)
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
          self.#clickSelect(d.id, selectMode(event))
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
    const scope = this.#scopeIds()
    const hop = this.#overlays.get('hop')
    const outside = e => !!scope && !scope.has(e.source.node) && !scope.has(e.target.node)
    const [wMin, wMax] = widths?.range ?? [1, 8]
    const all = enter
      .merge(sel)
      .filter((d, i, groups) =>
        stale(groups[i], [
          revOf(d),
          this.#routeOf(d).path,
          interactive && this.#selection.has(d.id),
          !!(m.nodes.get(d.source.node)?.ghost || m.nodes.get(d.target.node)?.ghost),
          !!dim && !dim.has(d.id),
          widths?.values?.[d.id] ?? null,
          widths ? [wDomain, wMin, wMax] : null,
          outside(d),
          hop?.edge === d.id,
          this.#themeVersion,
        ])
      )
    all
      .classed('sg-selected', d => interactive && this.#selection.has(d.id))
      .classed('sg-out-of-scope', outside)
      .classed('sg-hop', d => hop?.edge === d.id)
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
      // Line and arrowheads by connection kind (design system §6).
      const kind = d.kind ?? 'sync'
      const mark = (/** @type {string} */ name) =>
        `url(#${this.#uid}-${name}${selected ? '-active' : ''})`
      const head =
        kind === 'stream'
          ? 'chevron'
          : kind === 'async' || kind === 'batch'
            ? 'arrow-open'
            : 'arrow'
      g.classed(`sg-kind-${kind}`, true)
      g.select('.sg-edge-path')
        .attr('d', route.path)
        .attr('marker-end', d.arrow === false ? null : mark(head))
        .attr(
          'marker-start',
          kind === 'db'
            ? mark('dot')
            : kind === 'stream' && d.bidirectional
              ? mark('chevron')
              : null
        )
        .style('stroke', d.style?.stroke ?? null)
        .style('stroke-dasharray', d.style?.dash ?? null)
        .style(
          'stroke-width',
          typeof wv === 'number'
            ? String(wMin + (wMax - wMin) * normalise(wv, wDomain))
            : (d.style?.width ?? null)
        )
      const parts = labelParts(d)
      const lg = g.select('.sg-edge-label-group').attr('display', parts.length ? null : 'none')
      const pill = this.#pill(d, route)
      if (pill) {
        const gap = parts.length > 1 ? 6 : 0
        lg.select('.sg-edge-label-bg')
          .attr('x', pill.x)
          .attr('y', pill.y)
          .attr('width', pill.w)
          .attr('height', pill.h)
          .attr('rx', pill.h / 2)
        lg.select('.sg-edge-label')
          .attr('x', route.label.x)
          .attr('y', route.label.y)
          .text(null)
          .selectAll('tspan')
          .data(parts)
          .join('tspan')
          .attr('class', p => p.cls)
          .attr('dx', (_, i) => (i ? gap : null))
          .text(p => p.text)
      }
    })
  }

  /**
   * Where an edge's label pill is drawn, or null when it has no label.
   * @param {any} edge @param {{ label: { x: number, y: number } }} route
   * @returns {Rect|null}
   */
  #pill(edge, route) {
    const parts = labelParts(edge)
    if (!parts.length) return null
    const text = parts.reduce(
      (sum, p) =>
        sum + (p.cls === 'sg-method' ? this.#measureMono(p.text) : this.#measureSmall(p.text)),
      0
    )
    const w = text + (parts.length > 1 ? 6 : 0) + 14
    const h = this.#fontSize + 8
    return { x: route.label.x - w / 2, y: route.label.y - h / 2, w, h }
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
        d.size,
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
          // A leader ending in a 4 px dot at the target (design system §6).
          const from = boundaryAnchor(r, to)
          g.append('path')
            .attr('class', 'sg-leader')
            .attr('d', `M${from.x},${from.y} L${to.x},${to.y}`)
          g.append('circle')
            .attr('class', 'sg-leader-dot')
            .attr('cx', to.x)
            .attr('cy', to.y)
            .attr('r', 2)
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
        // Free text comes in body or title size (design system §6).
        const title = d.kind === 'text' && d.size === 'title'
        const scale = title ? (parseFloat(this.#tokens.fontSizeTitle) || 16) / this.#fontSize : 1
        const measure = t => this.#measure(t) * scale
        const pad = 8
        const lineH = this.#fontSize * scale * 1.3
        const maxLines = Math.max(1, Math.floor((r.h - 2 * pad) / lineH))
        const lines = wrapText(d.text, r.w - 2 * pad, measure, { maxLines })
        const text = g
          .append('text')
          .attr('class', title ? 'sg-annotation-text sg-text-title' : 'sg-annotation-text')
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

  /** Whether the box with this id may be resized: not read-only, locked, hidden or a ghost. */
  #resizable(/** @type {string} */ id) {
    const m = this.#model
    const kind = m.kindOf(id)
    const item = /** @type {any} */ (m.get(id))
    return (
      !this.#opts.readOnly &&
      !!item &&
      !!kind &&
      MOVABLE.has(kind) &&
      !m.isLocked(item) &&
      !item.ghost &&
      !item.readOnly &&
      !m.isHidden(item)
    )
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
    // Each guide's gap to its nearest shape, labelled at 11 px (design system §6).
    const gaps = d?.type === 'move' ? (d.gaps ?? []) : []
    L.guides
      .selectChildren('text.sg-guide-label')
      .data(gaps)
      .join('text')
      .attr('class', 'sg-guide-label')
      .filter((g, i, nodes) => stale(nodes[i], [g, k]))
      .attr('x', g => (g.axis === 'x' ? g.value + 4 / k : (g.from + g.to) / 2))
      .attr('y', g => (g.axis === 'x' ? (g.from + g.to) / 2 : g.value - 4 / k))
      .attr('text-anchor', g => (g.axis === 'x' ? 'start' : 'middle'))
      .attr('dominant-baseline', g => (g.axis === 'x' ? 'central' : 'auto'))
      .attr('stroke-width', 3 / k)
      .style('font-size', `${11 / k}px`)
      .text(g => String(Math.round(g.to - g.from)))

    // Resize handles for a single selected box
    const single = this.#selection.size === 1 ? [...this.#selection][0] : null
    const kind = single ? m.kindOf(single) : null
    const resizable = !!single && this.#resizable(single) && d?.type !== 'move'
    const handles = []
    if (resizable) {
      const r = this.#itemRect(/** @type {string} */ (single))
      for (const dir of HANDLE_DIRS) handles.push({ id: single, dir, ...handleAt(r, dir) })
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
      // An insert handle that would sit on the label pill moves along its segment, clear of it.
      const pill = this.#pill(edge, route)
      const clear = pill && expand(pill, 8 / k)
      for (let index = 0; index < control.length - 1; index++) {
        const a = control[index]
        const b = control[index + 1]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const at = clear ? slideOut(mid, a, b, clear) : mid
        edgeHandles.push({ edge: edge.id, role: 'insert', index, ...at, key: `i${index}` })
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
    const refused = connecting ? (d.refused ?? null) : null
    if (connecting || this.#portTargetShown) {
      this.#svg.classed('sg-connecting', connecting).classed('sg-connect-invalid', !!refused)
      const at = (/** @type {any} */ el, /** @type {any} */ end) =>
        !!end &&
        el.parentNode?.parentNode?.getAttribute('data-id') === end.node &&
        el.getAttribute('data-port') === end.port
      L.nodes
        .selectAll('.sg-port')
        .classed('sg-port-target', function () {
          return connecting && at(this, d.target)
        })
        .classed('sg-port-invalid', function () {
          return at(this, refused)
        })
      this.#portTargetShown = connecting
    }
    // Why a connection is refused, above the refusing node (design system §6: invalid connect
    // target).
    const reason = refused?.reason ? [refused] : []
    const refusal = L.handles
      .selectChildren('g.sg-refusal')
      .data(reason)
      .join(enter => {
        const g = enter.append('g').attr('class', 'sg-refusal')
        g.append('rect').attr('rx', 4)
        g.append('text')
        return g
      })
      .filter((/** @type {any} */ f, i, nodes) => stale(nodes[i], [f.node, f.port, f.reason, k]))
    refusal.each((/** @type {any} */ f, i, nodes) => {
      const p = this.#portPoint(f)
      const top = this.#itemRect(f.node)?.y ?? p.y
      const w = (this.#measure(f.reason) + 12) / k
      const h = 20 / k
      const g = this.#d3
        .select(nodes[i])
        .attr('transform', `translate(${p.x + 12 / k},${top - h - 6 / k})`)
      g.select('rect')
        .attr('width', w)
        .attr('height', h)
        .attr('stroke-width', 1 / k)
      g.select('text')
        .attr('x', 6 / k)
        .attr('y', h / 2)
        .style('font-size', `${12 / k}px`)
        .text(f.reason)
    })

    // One box around a multi-selection, with handles that resize the group when every box in
    // it can be resized, and dashed outlines where dragged nodes started.
    const ids = [...this.#selection].filter(id => m.kindOf(id) !== 'edge' && m.rectOf(id))
    const group =
      ids.length > 1 && d?.type !== 'move'
        ? expand(union(ids.map(id => this.#itemRect(id))), 8 / k)
        : null
    L.handles
      .selectChildren('rect.sg-selection-box')
      .data(group ? [group] : [])
      .join('rect')
      .attr('class', 'sg-selection-box')
      .filter((/** @type {any} */ b, i, nodes) => stale(nodes[i], [b, k]))
      .attr('x', (/** @type {any} */ b) => b.x)
      .attr('y', (/** @type {any} */ b) => b.y)
      .attr('width', (/** @type {any} */ b) => b.w)
      .attr('height', (/** @type {any} */ b) => b.h)
      .attr('stroke-width', 1 / k)
    const groupHandles =
      group && ids.every(id => this.#resizable(id))
        ? HANDLE_DIRS.map(dir => ({ dir, ids, ...handleAt(group, dir) }))
        : []
    L.handles
      .selectChildren('rect.sg-group-handle')
      .data(groupHandles, (/** @type {any} */ h) => h.dir)
      .join(enter => enter.append('rect').call(this.#groupResizeDragBehavior()))
      .filter((/** @type {any} */ h, i, nodes) => stale(nodes[i], [h, k]))
      .attr('class', (/** @type {any} */ h) => `sg-group-handle sg-handle-${h.dir}`)
      .attr('x', (/** @type {any} */ h) => h.x - size / 2)
      .attr('y', (/** @type {any} */ h) => h.y - size / 2)
      .attr('width', size)
      .attr('height', size)
      .attr('stroke-width', 1.5 / k)
    const origins =
      d?.type === 'move' && d.moved
        ? d.ids
            .filter((/** @type {string} */ id) => m.kindOf(id) === 'node')
            .map((/** @type {string} */ id) => ({ id, ...m.rectOf(id) }))
        : []
    const radius = Number(this.#tokens.radius) || 0
    L.handles
      .selectChildren('rect.sg-drag-origin')
      .data(origins, (/** @type {any} */ o) => o.id)
      .join('rect')
      .attr('class', 'sg-drag-origin')
      .filter((/** @type {any} */ o, i, nodes) => stale(nodes[i], [o, k]))
      .attr('x', (/** @type {any} */ o) => o.x)
      .attr('y', (/** @type {any} */ o) => o.y)
      .attr('width', (/** @type {any} */ o) => o.w)
      .attr('height', (/** @type {any} */ o) => o.h)
      .attr('rx', radius)
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
/**
 * What a drawn item's key holds of its data: its rev when the host gives one (eng §12: updates
 * touch only elements whose rev changed), otherwise all of it.
 * @param {{ rev?: unknown }} d
 */
const revOf = d => (d.rev !== undefined ? d.rev : d)

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
