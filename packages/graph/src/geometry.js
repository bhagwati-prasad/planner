/**
 * Rectangles, points and port placement. Pure functions; coordinates are world units.
 *
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {'left'|'right'|'top'|'bottom'} Side
 * @typedef {{ id: string, side?: Side, offset?: number, direction?: 'in'|'out'|'both', label?: string }} PortSpec
 * @typedef {Point & { side: Side|null }} Anchor
 */

/** @type {readonly Side[]} */
export const SIDES = Object.freeze(['left', 'right', 'top', 'bottom'])

/** Unit vector pointing out of a side. @param {Side|null|undefined} side */
export function sideVector (side) {
  switch (side) {
    case 'left': return { x: -1, y: 0 }
    case 'right': return { x: 1, y: 0 }
    case 'top': return { x: 0, y: -1 }
    case 'bottom': return { x: 0, y: 1 }
    default: return { x: 0, y: 0 }
  }
}

/** @param {Side} side */
export const isHorizontalSide = side => side === 'left' || side === 'right'

/** @param {Rect} r */
export const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** @param {Rect} r @param {number} m */
export const expand = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m })

/** Overlap test; touching edges do not count. @param {Rect} a @param {Rect} b */
export function intersects (a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** @param {Rect} r @param {Point} p */
export function containsPoint (r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

/** Strictly inside (not on the border). @param {Rect} r @param {Point} p */
export function strictlyInside (r, p) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
}

/** @param {Rect} outer @param {Rect} inner */
export function containsRect (outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

/**
 * Smallest rectangle containing all of them, or null for none.
 * @param {Iterable<Rect>} rects
 * @returns {Rect|null}
 */
export function union (rects) {
  let x1 = Infinity; let y1 = Infinity; let x2 = -Infinity; let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h)
  }
  return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** Rectangle spanning two corner points (any order). @param {Point} a @param {Point} b */
export function rectFromPoints (a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

/** @param {Point} a @param {Point} b */
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Absolute positions of a node's ports. Ports on the same side without an explicit offset
 * are spread evenly along it; `offset` (0..1) pins a port along its side.
 * @param {Rect} node
 * @param {PortSpec[]} ports
 * @returns {Map<string, Anchor>}
 */
export function portAnchors (node, ports) {
  /** @type {Record<string, PortSpec[]>} */
  const bySide = { left: [], right: [], top: [], bottom: [] }
  for (const port of ports) bySide[port.side ?? defaultSide(port)].push(port)
  const out = new Map()
  for (const side of SIDES) {
    const list = bySide[side]
    list.forEach((port, i) => {
      const t = port.offset ?? (i + 1) / (list.length + 1)
      out.set(port.id, pointOnSide(node, side, t))
    })
  }
  return out
}

/**
 * Inputs sit on the left and outputs on the right unless told otherwise.
 * @param {PortSpec} port
 * @returns {Side}
 */
function defaultSide (port) {
  return port.direction === 'out' ? 'right' : port.direction === 'both' ? 'bottom' : 'left'
}

/**
 * @param {Rect} r
 * @param {Side} side
 * @param {number} t 0..1 along the side (top to bottom, or left to right)
 * @returns {Anchor}
 */
export function pointOnSide (r, side, t) {
  switch (side) {
    case 'left': return { x: r.x, y: r.y + r.h * t, side }
    case 'right': return { x: r.x + r.w, y: r.y + r.h * t, side }
    case 'top': return { x: r.x + r.w * t, y: r.y, side }
    default: return { x: r.x + r.w * t, y: r.y + r.h, side: 'bottom' }
  }
}

/**
 * Where the line from the rectangle's centre toward `toward` crosses its border, with the
 * side it leaves through. Used for edges that attach to a node rather than a port.
 * @param {Rect} r
 * @param {Point} toward
 * @returns {Anchor}
 */
export function boundaryAnchor (r, toward) {
  const c = center(r)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return { x: c.x, y: r.y, side: 'top' }
  const sx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx)
  const sy = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy)
  if (sx < sy) return { x: c.x + dx * sx, y: c.y + dy * sx, side: dx > 0 ? 'right' : 'left' }
  return { x: c.x + dx * sy, y: c.y + dy * sy, side: dy > 0 ? 'bottom' : 'top' }
}

/**
 * True when the open segment a→b passes through the interior of r.
 * @param {Point} a
 * @param {Point} b
 * @param {Rect} r
 */
export function segmentCrossesRect (a, b, r) {
  // Liang–Barsky clipping against the open rectangle.
  const x1 = r.x; const y1 = r.y; const x2 = r.x + r.w; const y2 = r.y + r.h
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p, q) => {
    if (p === 0) return q > 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  if (!clip(-dx, a.x - x1) || !clip(dx, x2 - a.x) || !clip(-dy, a.y - y1) || !clip(dy, y2 - a.y)) return false
  if (t1 - t0 <= 1e-9) return false
  const mid = { x: a.x + dx * (t0 + t1) / 2, y: a.y + dy * (t0 + t1) / 2 }
  return strictlyInside(r, mid)
}

/** Rounds a value to a grid step (grid <= 0 leaves it unchanged). @param {number} v @param {number} grid */
export function snap (v, grid) {
  return grid > 0 ? Math.round(v / grid) * grid : v
}
