/**
 * Uniform-grid spatial index for rectangles: marquee selection, nearest-port lookup while
 * connecting, smart-guide candidates and viewport culling all query it.
 */
import { intersects } from './geometry.js'

/** @typedef {import('./geometry.js').Rect} Rect */

export class SpatialIndex {
  #cell
  /** @type {Map<string, Set<string>>} cell key → ids */
  #cells = new Map()
  /** @type {Map<string, { rect: Rect, keys: string[] }>} */
  #items = new Map()

  /** @param {number} [cellSize] world units per cell */
  constructor(cellSize = 256) {
    this.#cell = cellSize
  }

  get size() {
    return this.#items.size
  }

  /** @param {Rect} r */
  #keys(r) {
    const c = this.#cell
    const keys = []
    const x2 = Math.floor((r.x + r.w) / c)
    const y2 = Math.floor((r.y + r.h) / c)
    for (let i = Math.floor(r.x / c); i <= x2; i++)
      for (let j = Math.floor(r.y / c); j <= y2; j++) keys.push(`${i},${j}`)
    return keys
  }

  /** Adds or moves an item. @param {string} id @param {Rect} rect */
  set(id, rect) {
    this.delete(id)
    const keys = this.#keys(rect)
    for (const k of keys) {
      let set = this.#cells.get(k)
      if (!set) this.#cells.set(k, (set = new Set()))
      set.add(id)
    }
    this.#items.set(id, { rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, keys })
  }

  /** @param {string} id */
  delete(id) {
    const item = this.#items.get(id)
    if (!item) return false
    for (const k of item.keys) {
      const set = this.#cells.get(k)
      set?.delete(id)
      if (set && set.size === 0) this.#cells.delete(k)
    }
    this.#items.delete(id)
    return true
  }

  clear() {
    this.#cells.clear()
    this.#items.clear()
  }

  /** @param {string} id */
  get(id) {
    return this.#items.get(id)?.rect
  }

  /**
   * Ids whose rectangles overlap `rect` (touching counts), in insertion order.
   * @param {Rect} rect
   * @param {(id: string) => boolean} [filter]
   */
  query(rect, filter) {
    const seen = new Set()
    const out = []
    const probe = { x: rect.x - 1e-9, y: rect.y - 1e-9, w: rect.w + 2e-9, h: rect.h + 2e-9 }
    for (const k of this.#keys(rect)) {
      for (const id of this.#cells.get(k) ?? []) {
        if (seen.has(id)) continue
        seen.add(id)
        const item = /** @type {{ rect: Rect }} */ (this.#items.get(id))
        if (intersects(item.rect, probe) && (!filter || filter(id))) out.push(id)
      }
    }
    return out
  }

  /**
   * Ids whose rectangles lie entirely inside `rect`.
   * @param {Rect} rect
   */
  within(rect) {
    return this.query(rect).filter(id => {
      const r = /** @type {Rect} */ (this.get(id))
      return (
        r.x >= rect.x &&
        r.y >= rect.y &&
        r.x + r.w <= rect.x + rect.w &&
        r.y + r.h <= rect.y + rect.h
      )
    })
  }

  /**
   * The item closest to a point within `radius` (distance to its rectangle), or null.
   * @param {{ x: number, y: number }} point
   * @param {number} radius
   * @param {(id: string) => boolean} [filter]
   */
  nearest(point, radius, filter) {
    let best = null
    let bestD = Infinity
    for (const id of this.query(
      { x: point.x - radius, y: point.y - radius, w: 2 * radius, h: 2 * radius },
      filter
    )) {
      const r = /** @type {Rect} */ (this.get(id))
      const dx = Math.max(r.x - point.x, 0, point.x - (r.x + r.w))
      const dy = Math.max(r.y - point.y, 0, point.y - (r.y + r.h))
      const d = Math.hypot(dx, dy)
      if (d <= radius && d < bestD) {
        best = id
        bestD = d
      }
    }
    return best
  }
}
