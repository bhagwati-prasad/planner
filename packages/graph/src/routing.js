/**
 * Edge routing (spec §9): straight, orthogonal and curved connectors, with or without
 * user waypoints. The orthogonal router finds a path around obstacles with A* over a sparse
 * grid built from obstacle edges (orthogonal connector routing), penalising bends.
 * Pure functions; everything is in world coordinates.
 */
import {
  expand,
  intersects,
  segmentCrossesRect,
  sideVector,
  strictlyInside,
  union,
} from './geometry.js'

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./geometry.js').Rect} Rect */
/** @typedef {import('./geometry.js').Anchor} Anchor */
/** @typedef {'straight'|'orthogonal'|'curved'} Routing */

export const ROUTINGS = Object.freeze(['straight', 'orthogonal', 'curved'])

const DEFAULTS = { stub: 20, margin: 12, bendPenalty: 24, maxObstacles: 80, reach: 240, radius: 8 }

/**
 * @typedef {object} RouteInput
 * @property {Anchor} source
 * @property {Anchor} target
 * @property {Routing} [routing]
 * @property {Point[]} [waypoints]
 * @property {Rect[]} [obstacles]  rectangles to route around (orthogonal only)
 * @property {Partial<typeof DEFAULTS>} [options]
 *
 * @typedef {object} Route
 * @property {Point[]} points     polyline (for curved: the points the curve passes through)
 * @property {string} path        SVG path data
 * @property {Point} label        where a label sits (halfway along)
 * @property {number} endAngle    direction of travel at the target, in radians
 */

/**
 * @param {RouteInput} input
 * @returns {Route}
 */
export function routeEdge({
  source,
  target,
  routing = 'orthogonal',
  waypoints = [],
  obstacles = [],
  options = {},
}) {
  const opts = { ...DEFAULTS, ...options }
  if (routing === 'curved') return curvedRoute(source, target, waypoints)
  let points
  if (routing === 'straight') {
    points = simplify([source, ...waypoints, target])
  } else if (waypoints.length) {
    points = orthogonalThrough([source, ...waypoints, target], source.side, target.side)
  } else {
    points = routeOrthogonal(source, target, obstacles, opts)
  }
  return {
    points,
    path: polylinePath(points, routing === 'orthogonal' ? opts.radius : 0),
    label: pointAlong(points, 0.5),
    endAngle: endAngle(points),
  }
}

/**
 * Orthogonal route from `source` to `target` avoiding `obstacles`.
 * Each end leaves its port by a short stub in the direction its side faces.
 * @param {Anchor} source
 * @param {Anchor} target
 * @param {Rect[]} obstacles
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {Point[]}
 */
export function routeOrthogonal(source, target, obstacles = [], options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const sv = sideVector(source.side)
  const tv = sideVector(target.side)
  const s1 = { x: source.x + sv.x * opts.stub, y: source.y + sv.y * opts.stub }
  const t1 = { x: target.x + tv.x * opts.stub, y: target.y + tv.y * opts.stub }

  // Only obstacles near the connection matter; cap their number to bound the search.
  const area = expand(/** @type {Rect} */ (union([rectOf(s1), rectOf(t1)])), opts.reach)
  const near = obstacles
    .map(r => expand(r, opts.margin))
    .filter(r => intersects(r, area) && !strictlyInside(r, s1) && !strictlyInside(r, t1))
    .slice(0, opts.maxObstacles)

  const startDir = source.side ? sv : null
  // Arriving at t1 we want to travel opposite to the target side's outward vector.
  const endDir = target.side ? { x: -tv.x, y: -tv.y } : null
  const middle =
    searchGrid(s1, t1, near, startDir, endDir, opts.bendPenalty) ?? fallbackRoute(s1, t1, startDir)
  return simplify([source, ...middle, target])
}

/** Corner-to-corner Z route used when the search finds nothing. */
function fallbackRoute(s1, t1, startDir) {
  if (startDir && startDir.y !== 0) {
    const midY = (s1.y + t1.y) / 2
    return [s1, { x: s1.x, y: midY }, { x: t1.x, y: midY }, t1]
  }
  const midX = (s1.x + t1.x) / 2
  return [s1, { x: midX, y: s1.y }, { x: midX, y: t1.y }, t1]
}

/**
 * A* over the grid of lines through obstacle edges and the two stub points.
 * @returns {Point[]|null}
 */
function searchGrid(s1, t1, obstacles, startDir, endDir, bendPenalty) {
  const xs = uniqueSorted([
    s1.x,
    t1.x,
    (s1.x + t1.x) / 2,
    ...obstacles.flatMap(r => [r.x, r.x + r.w]),
  ])
  const ys = uniqueSorted([
    s1.y,
    t1.y,
    (s1.y + t1.y) / 2,
    ...obstacles.flatMap(r => [r.y, r.y + r.h]),
  ])
  const blocked = (x, y) => obstacles.some(r => strictlyInside(r, { x, y }))
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))
  const start = [
    /** @type {number} */ (xi.get(round3(s1.x))),
    /** @type {number} */ (yi.get(round3(s1.y))),
  ]
  const goal = [
    /** @type {number} */ (xi.get(round3(t1.x))),
    /** @type {number} */ (yi.get(round3(t1.y))),
  ]
  const W = xs.length
  const key = (i, j, d) => (j * W + i) * 5 + d // d: 0 none, 1 +x, 2 -x, 3 +y, 4 -y
  const DIRS = [null, [1, 0], [-1, 0], [0, 1], [0, -1]]
  const dirIndex = v => (!v ? 0 : v.x > 0 ? 1 : v.x < 0 ? 2 : v.y > 0 ? 3 : v.y < 0 ? 4 : 0)
  const h = (i, j) => Math.abs(xs[i] - xs[goal[0]]) + Math.abs(ys[j] - ys[goal[1]])

  const heap = new MinHeap()
  const best = new Map()
  const prev = new Map()
  const d0 = dirIndex(startDir)
  const k0 = key(start[0], start[1], d0)
  best.set(k0, 0)
  heap.push(h(start[0], start[1]), [start[0], start[1], d0, 0])
  const edgeCache = new Map()
  const free = (i1, j1, i2, j2) => {
    const k = `${i1},${j1},${i2},${j2}`
    let v = edgeCache.get(k)
    if (v === undefined) {
      const a = { x: xs[i1], y: ys[j1] }
      const b = { x: xs[i2], y: ys[j2] }
      v = !obstacles.some(r => segmentCrossesRect(a, b, r))
      edgeCache.set(k, v)
    }
    return v
  }
  const endD = dirIndex(endDir)
  while (heap.size) {
    const [i, j, d, g] = /** @type {number[]} */ (heap.pop())
    const k = key(i, j, d)
    if (g > (best.get(k) ?? Infinity)) continue
    if (i === goal[0] && j === goal[1]) {
      // An arrival against the required direction costs one more bend (added when relaxing).
      const path = []
      let cur = k
      while (cur !== undefined) {
        const ci = Math.floor(cur / 5) % W
        const cj = Math.floor(Math.floor(cur / 5) / W)
        path.unshift({ x: xs[ci], y: ys[cj] })
        cur = prev.get(cur)
      }
      return path
    }
    for (let nd = 1; nd <= 4; nd++) {
      const [di, dj] = /** @type {number[]} */ (DIRS[nd])
      if (d && di === -DIRS[d][0] && dj === -DIRS[d][1]) continue // no U-turns
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= W || nj >= ys.length) continue
      if (blocked(xs[ni], ys[nj]) || !free(i, j, ni, nj)) continue
      let cost = g + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j])
      if (d && nd !== d) cost += bendPenalty
      if (ni === goal[0] && nj === goal[1] && endD && nd !== endD) cost += bendPenalty
      const nk = key(ni, nj, nd)
      if (cost < (best.get(nk) ?? Infinity)) {
        best.set(nk, cost)
        prev.set(nk, k)
        heap.push(cost + h(ni, nj), [ni, nj, nd, cost])
      }
    }
  }
  return null
}

/**
 * Orthogonal polyline through fixed points: each hop becomes an L (one horizontal and one
 * vertical segment). The first hop leaves along the source side, each later hop carries on in
 * the direction the previous one arrived, and the last hop arrives along the target side.
 * @param {Point[]} pts
 * @param {import('./geometry.js').Side|null} [firstSide]
 * @param {import('./geometry.js').Side|null} [lastSide]
 */
export function orthogonalThrough(pts, firstSide, lastSide) {
  const isH = side => side === 'left' || side === 'right'
  const out = [pts[0]]
  let horizontalFirst = firstSide ? isH(firstSide) : true
  for (let i = 1; i < pts.length; i++) {
    if (i === pts.length - 1 && lastSide && i > 1) horizontalFirst = !isH(lastSide)
    const a = out[out.length - 1]
    const b = pts[i]
    if (a.x !== b.x && a.y !== b.y)
      out.push(horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y })
    out.push(b)
    horizontalFirst = !horizontalFirst
  }
  return simplify(out)
}

/**
 * Curved connector: a cubic Bézier leaving and entering along the port sides, or a smooth
 * Catmull-Rom curve through waypoints.
 * @param {Anchor} source
 * @param {Anchor} target
 * @param {Point[]} waypoints
 * @returns {Route}
 */
function curvedRoute(source, target, waypoints) {
  if (waypoints.length) {
    const pts = [source, ...waypoints, target]
    let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
      d += ` C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(p2.x)},${fmt(p2.y)}`
    }
    return { points: pts, path: d, label: pointAlong(pts, 0.5), endAngle: endAngle(pts) }
  }
  const dist = Math.hypot(target.x - source.x, target.y - source.y)
  const reach = Math.max(30, dist / 2.5)
  const sv = source.side ? sideVector(source.side) : unit(source, target)
  const tv = target.side ? sideVector(target.side) : unit(target, source)
  const c1 = { x: source.x + sv.x * reach, y: source.y + sv.y * reach }
  const c2 = { x: target.x + tv.x * reach, y: target.y + tv.y * reach }
  const path = `M${fmt(source.x)},${fmt(source.y)} C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(target.x)},${fmt(target.y)}`
  const mid = cubicPoint(source, c1, c2, target, 0.5)
  return {
    points: [source, target],
    path,
    label: mid,
    endAngle: Math.atan2(target.y - c2.y, target.x - c2.x),
  }
}

function unit(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
}

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/**
 * SVG path through points, optionally rounding the corners.
 * @param {Point[]} pts
 * @param {number} [radius]
 */
export function polylinePath(pts, radius = 0) {
  if (!pts.length) return ''
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const next = pts[i + 1]
    if (radius > 0 && next) {
      const prev = pts[i - 1]
      const r = Math.min(
        radius,
        Math.hypot(p.x - prev.x, p.y - prev.y) / 2,
        Math.hypot(next.x - p.x, next.y - p.y) / 2
      )
      const a = towards(p, prev, r)
      const b = towards(p, next, r)
      d += ` L${fmt(a.x)},${fmt(a.y)} Q${fmt(p.x)},${fmt(p.y)} ${fmt(b.x)},${fmt(b.y)}`
    } else {
      d += ` L${fmt(p.x)},${fmt(p.y)}`
    }
  }
  return d
}

function towards(from, to, dist) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: from.x + ((to.x - from.x) * dist) / len, y: from.y + ((to.y - from.y) * dist) / len }
}

/**
 * The point a fraction of the way along a polyline.
 * @param {Point[]} pts
 * @param {number} t 0..1
 */
export function pointAlong(pts, t) {
  const lengths = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    lengths.push(l)
    total += l
  }
  if (total === 0) return { x: pts[0].x, y: pts[0].y }
  let remaining = total * t
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? Math.min(1, remaining / lengths[i]) : 0
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      }
    }
    remaining -= lengths[i]
  }
  return { ...pts[pts.length - 1] }
}

/** Direction of the last segment, in radians. @param {Point[]} pts */
function endAngle(pts) {
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.x !== b.x || a.y !== b.y) return Math.atan2(b.y - a.y, b.x - a.x)
  }
  return 0
}

/**
 * Drops repeated points and middle points of straight runs.
 * @param {Point[]} pts
 */
export function simplify(pts) {
  const out = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue
    out.push({ x: p.x, y: p.y })
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3)
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
      if (Math.abs(cross) < 1e-9 && dot >= 0) out.splice(out.length - 2, 1)
      else break
    }
  }
  return out
}

/** @param {number} v */
const round3 = v => Math.round(v * 1000) / 1000

/** @param {number[]} values */
function uniqueSorted(values) {
  return [...new Set(values.map(round3))].sort((a, b) => a - b)
}

/** @param {Point} p */
function rectOf(p) {
  return { x: p.x, y: p.y, w: 0, h: 0 }
}

/** @param {number} v */
function fmt(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

/** Binary min-heap keyed by priority. */
export class MinHeap {
  /** @type {{ p: number, v: unknown }[]} */
  #items = []
  get size() {
    return this.#items.length
  }
  /** @param {number} priority @param {unknown} value */
  push(priority, value) {
    const items = this.#items
    items.push({ p: priority, v: value })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].p <= items[i].p) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }
  pop() {
    const items = this.#items
    if (!items.length) return undefined
    const top = items[0].v
    const last = /** @type {{ p: number, v: unknown }} */ (items.pop())
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && items[l].p < items[m].p) m = l
        if (r < items.length && items[r].p < items[m].p) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }
    return top
  }
}
