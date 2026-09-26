/**
 * Viewport maths: the transform maps world coordinates to screen pixels,
 * screen = world * k + (x, y), matching d3-zoom's transform.
 *
 * @typedef {{ x: number, y: number, k: number }} Transform
 * @typedef {{ width: number, height: number }} Size
 */

export const IDENTITY = Object.freeze({ x: 0, y: 0, k: 1 })

/** @param {Transform} t @param {{ x: number, y: number }} p */
export const screenToWorld = (t, p) => ({ x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k })

/** @param {Transform} t @param {{ x: number, y: number }} p */
export const worldToScreen = (t, p) => ({ x: p.x * t.k + t.x, y: p.y * t.k + t.y })

/**
 * The world rectangle visible in a viewport.
 * @param {Transform} t
 * @param {Size} size
 */
export function visibleRect(t, size) {
  const a = screenToWorld(t, { x: 0, y: 0 })
  return { x: a.x, y: a.y, w: size.width / t.k, h: size.height / t.k }
}

/**
 * Transform that fits `bounds` in the viewport with padding, centred, within scale limits.
 * @param {import('./geometry.js').Rect|null} bounds
 * @param {Size} size
 * @param {{ padding?: number, minScale?: number, maxScale?: number }} [options]
 * @returns {Transform}
 */
export function fitTransform(bounds, size, { padding = 40, minScale = 0.05, maxScale = 1 } = {}) {
  if (!bounds || size.width <= 0 || size.height <= 0) return { ...IDENTITY }
  const w = Math.max(bounds.w, 1)
  const h = Math.max(bounds.h, 1)
  const k = clamp(
    Math.min((size.width - 2 * padding) / w, (size.height - 2 * padding) / h),
    minScale,
    maxScale
  )
  return {
    x: size.width / 2 - (bounds.x + w / 2) * k,
    y: size.height / 2 - (bounds.y + h / 2) * k,
    k,
  }
}

/**
 * Zooms by `factor` keeping the screen point `at` fixed.
 * @param {Transform} t
 * @param {number} factor
 * @param {{ x: number, y: number }} at screen point
 * @param {{ minScale?: number, maxScale?: number }} [limits]
 */
export function zoomAt(t, factor, at, { minScale = 0.05, maxScale = 4 } = {}) {
  const k = clamp(t.k * factor, minScale, maxScale)
  const world = screenToWorld(t, at)
  return { x: at.x - world.x * k, y: at.y - world.y * k, k }
}

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}
