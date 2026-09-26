/**
 * Align and distribute (spec §9). Pure: returns new positions; the graph turns them into a
 * move intent and the host decides.
 */

/** @typedef {import('./geometry.js').Rect & { id: string }} Item */

export const ALIGN_MODES = Object.freeze(['left', 'center', 'right', 'top', 'middle', 'bottom'])

/**
 * @param {Item[]} items
 * @param {'left'|'center'|'right'|'top'|'middle'|'bottom'} mode
 * @returns {{ id: string, x: number, y: number }[]}
 */
export function align(items, mode) {
  if (items.length < 2) return items.map(({ id, x, y }) => ({ id, x, y }))
  const left = Math.min(...items.map(i => i.x))
  const right = Math.max(...items.map(i => i.x + i.w))
  const top = Math.min(...items.map(i => i.y))
  const bottom = Math.max(...items.map(i => i.y + i.h))
  return items.map(i => {
    switch (mode) {
      case 'left':
        return { id: i.id, x: left, y: i.y }
      case 'right':
        return { id: i.id, x: right - i.w, y: i.y }
      case 'center':
        return { id: i.id, x: (left + right) / 2 - i.w / 2, y: i.y }
      case 'top':
        return { id: i.id, x: i.x, y: top }
      case 'bottom':
        return { id: i.id, x: i.x, y: bottom - i.h }
      case 'middle':
        return { id: i.id, x: i.x, y: (top + bottom) / 2 - i.h / 2 }
      default:
        throw new Error(`Unknown alignment '${mode}'`)
    }
  })
}

/**
 * Spaces items evenly between the first and last along an axis (equal gaps).
 * @param {Item[]} items
 * @param {'horizontal'|'vertical'} axis
 * @returns {{ id: string, x: number, y: number }[]}
 */
export function distribute(items, axis) {
  if (items.length < 3) return items.map(({ id, x, y }) => ({ id, x, y }))
  const horizontal = axis === 'horizontal'
  const pos = i => (horizontal ? i.x : i.y)
  const size = i => (horizontal ? i.w : i.h)
  const sorted = [...items].sort((a, b) => pos(a) - pos(b) || (a.id < b.id ? -1 : 1))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = pos(last) + size(last) - pos(first)
  const gap = (span - sorted.reduce((s, i) => s + size(i), 0)) / (sorted.length - 1)
  const placed = new Map()
  let cursor = pos(first)
  for (const item of sorted) {
    placed.set(item.id, cursor)
    cursor += size(item) + gap
  }
  return items.map(i =>
    horizontal
      ? { id: i.id, x: placed.get(i.id), y: i.y }
      : { id: i.id, x: i.x, y: placed.get(i.id) }
  )
}
