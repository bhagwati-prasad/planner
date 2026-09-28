// @ts-check
// The orthogonal router of strata-graph (task 0203), checked as a property over generated layouts.
import { describe, it } from 'node:test'
import { gen, property } from '../../../tools/testing/index.js'
import { routeEdge } from '../src/routing.js'
import { segmentCrossesRect } from '../src/geometry.js'

/** @typedef {import('../src/geometry.js').Rect} Rect */

const COLUMNS = 6
const ROWS = 4
const CELL = { w: 240, h: 160 }
const GAP = 24 // at least 2 × GAP between neighbouring components
const SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left'])

/** A component in each cell of a 6 × 4 grid, or none; sizes and offsets vary. */
const layout = gen.array(
  gen.record({
    present: gen.bool(),
    w: gen.int(80, 184),
    h: gen.int(40, 100),
    fx: gen.float(0, 1),
    fy: gen.float(0, 1),
  }),
  { min: COLUMNS * ROWS, max: COLUMNS * ROWS }
)

/** Which two components a connection joins, and the sides of their ports. */
const ends = gen.record({
  from: gen.int(0, COLUMNS * ROWS - 1),
  to: gen.int(0, COLUMNS * ROWS - 1),
  fromSide: gen.int(0, 3),
  toSide: gen.int(0, 3),
  along: gen.float(0.2, 0.8),
})

/**
 * @param {{ present: boolean, w: number, h: number, fx: number, fy: number }} cell
 * @param {number} i
 * @returns {Rect}
 */
function rectIn(cell, i) {
  const x = (i % COLUMNS) * CELL.w + GAP + cell.fx * (CELL.w - 2 * GAP - cell.w)
  const y = Math.floor(i / COLUMNS) * CELL.h + GAP + cell.fy * (CELL.h - 2 * GAP - cell.h)
  return { x: Math.round(x), y: Math.round(y), w: cell.w, h: cell.h }
}

/** A port on a side of a rectangle. @param {Rect} r @param {number} side @param {number} t */
function portOn(r, side, t) {
  const s = SIDES[side]
  if (s === 'top') return { x: r.x + r.w * t, y: r.y, side: s }
  if (s === 'bottom') return { x: r.x + r.w * t, y: r.y + r.h, side: s }
  if (s === 'left') return { x: r.x, y: r.y + r.h * t, side: s }
  return { x: r.x + r.w, y: r.y + r.h * t, side: s }
}

describe('orthogonal router', () => {
  it('never passes through a component’s bounds', () => {
    property(
      [layout, ends],
      (cells, e) => {
        if (e.from === e.to) return true
        const rects = cells
          .map((cell, i) => (cell.present || i === e.from || i === e.to ? rectIn(cell, i) : null))
          .filter(r => r !== null)
        const source = portOn(rectIn(cells[e.from], e.from), e.fromSide, e.along)
        const target = portOn(rectIn(cells[e.to], e.to), e.toSide, e.along)
        const { points } = routeEdge({ source, target, routing: 'orthogonal', obstacles: rects })
        for (let i = 1; i < points.length; i++)
          for (const r of rects)
            if (segmentCrossesRect(points[i - 1], points[i], r))
              throw new Error(
                `segment ${JSON.stringify([points[i - 1], points[i]])} crosses ${JSON.stringify(r)}`
              )
        return true
      },
      { runs: 300 }
    )
  })
})
