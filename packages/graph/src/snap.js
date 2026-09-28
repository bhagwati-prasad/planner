/**
 * Snapping (spec §9): grid snap and smart guides that line a moving shape up with the
 * edges and centres of its neighbours.
 */
import { snap } from './geometry.js'

/** @typedef {import('./geometry.js').Rect} Rect */

/**
 * @typedef {object} Guide
 * @property {'x'|'y'} axis  'x': a vertical line at `value`; 'y': a horizontal line
 * @property {number} value
 * @property {number} from   extent along the other axis
 * @property {number} to
 */

/**
 * Snaps a rectangle's position to the grid.
 * @param {Rect} r
 * @param {number} grid
 */
export function snapRect(r, grid) {
  return { ...r, x: snap(r.x, grid), y: snap(r.y, grid) }
}

/**
 * Offsets that align `moving` with the nearest edge or centre line of `others`, within
 * `threshold`, and the guide lines to draw.
 * @param {Rect} moving
 * @param {Rect[]} others
 * @param {number} threshold world units
 * @returns {{ dx: number, dy: number, guides: Guide[] }}
 */
export function smartGuides(moving, others, threshold) {
  const lines = r => ({
    x: [r.x, r.x + r.w / 2, r.x + r.w],
    y: [r.y, r.y + r.h / 2, r.y + r.h],
  })
  const m = lines(moving)
  let bestX = null
  let bestY = null
  for (const other of others) {
    const o = lines(other)
    for (const mv of m.x) {
      for (const ov of o.x) {
        const d = ov - mv
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d)))
          bestX = { d, value: ov }
      }
    }
    for (const mv of m.y) {
      for (const ov of o.y) {
        const d = ov - mv
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d)))
          bestY = { d, value: ov }
      }
    }
  }
  const dx = bestX?.d ?? 0
  const dy = bestY?.d ?? 0
  const snapped = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h }
  /** @type {Guide[]} */
  const guides = []
  // Draw each guide across every shape that lies on it.
  if (bestX) {
    const on = others.filter(o => lines(o).x.some(v => Math.abs(v - bestX.value) < 1e-6))
    const ys = [snapped.y, snapped.y + snapped.h, ...on.flatMap(o => [o.y, o.y + o.h])]
    guides.push({ axis: 'x', value: bestX.value, from: Math.min(...ys), to: Math.max(...ys) })
  }
  if (bestY) {
    const on = others.filter(o => lines(o).y.some(v => Math.abs(v - bestY.value) < 1e-6))
    const xs = [snapped.x, snapped.x + snapped.w, ...on.flatMap(o => [o.x, o.x + o.w])]
    guides.push({ axis: 'y', value: bestY.value, from: Math.min(...xs), to: Math.max(...xs) })
  }
  return { dx, dy, guides }
}

/**
 * Final position of a dragged rectangle: smart guides win on each axis they apply to; the
 * grid decides the rest.
 * @param {Rect} moving position before snapping
 * @param {Rect[]} others
 * @param {{ grid?: number, threshold?: number, guides?: boolean }} options
 */
export function snapMove(moving, others, { grid = 0, threshold = 6, guides = true } = {}) {
  const g = guides ? smartGuides(moving, others, threshold) : { dx: 0, dy: 0, guides: [] }
  const x =
    g.dx !== 0 || g.guides.some(l => l.axis === 'x') ? moving.x + g.dx : snap(moving.x, grid)
  const y =
    g.dy !== 0 || g.guides.some(l => l.axis === 'y') ? moving.y + g.dy : snap(moving.y, grid)
  return { x, y, guides: g.guides }
}

/**
 * The gap between a moved rectangle and the nearest shape on each guide, which the graph
 * labels with its distance (design system §6). A gap runs along its guide, from `from` to
 * `to`; a guide whose shapes all overlap the moved one has none.
 * @param {Rect} moving after snapping
 * @param {Rect[]} others
 * @param {Guide[]} guides
 * @returns {Guide[]}
 */
export function guideGaps(moving, others, guides) {
  /** @type {Guide[]} */
  const gaps = []
  for (const guide of guides) {
    // Along a vertical guide ('x') gaps are vertical, and the other way round.
    const [at, size, across, width] =
      guide.axis === 'x' ? ['y', 'h', 'x', 'w'] : ['x', 'w', 'y', 'h']
    const lines = (/** @type {Rect} */ r) => [
      r[across],
      r[across] + r[width] / 2,
      r[across] + r[width],
    ]
    let best = null
    for (const o of others) {
      if (!lines(o).some(v => Math.abs(v - guide.value) < 1e-6)) continue
      const gap =
        o[at] + o[size] <= moving[at]
          ? { from: o[at] + o[size], to: moving[at] }
          : moving[at] + moving[size] <= o[at]
            ? { from: moving[at] + moving[size], to: o[at] }
            : null
      if (gap && (!best || gap.to - gap.from < best.to - best.from)) best = gap
    }
    if (best && best.to > best.from) gaps.push({ axis: guide.axis, value: guide.value, ...best })
  }
  return gaps
}
