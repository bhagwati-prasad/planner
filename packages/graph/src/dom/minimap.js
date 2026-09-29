/**
 * Minimap (spec §9): an overview of the whole diagram with the visible area outlined.
 * Clicking or dragging on it moves the view. It reads the graph through its public API only.
 *
 *   const minimap = strataGraph.createMinimap(graph, element, { width: 200, height: 140 })
 */
import { union, expand } from '../geometry.js'
import { visibleRect } from '../viewport.js'
import { svgEl } from './svg.js'

/**
 * @param {import('./graph.js').Graph} graph
 * @param {HTMLElement} host
 * @param {{ width?: number, height?: number, padding?: number }} [options]
 */
export function createMinimap(graph, host, { width = 200, height = 140, padding = 40 } = {}) {
  const doc = host.ownerDocument
  const svg = svgEl(
    'svg',
    { class: 'sg-minimap', width, height, role: 'img', 'aria-label': 'Diagram overview' },
    doc
  )
  // Share the graph's theme variables (the minimap lives outside the graph's <svg>).
  // Through the CSSOM, which a CSP without 'unsafe-inline' allows (eng §16).
  const theme = () => {
    svg.style.cssText = `${graph.element.style.cssText} display: block; cursor: pointer; width: ${width}px; height: ${height}px;`
  }
  const bg = svgEl(
    'rect',
    { width: '100%', height: '100%', fill: 'var(--sg-background, #fafaf9)' },
    doc
  )
  const items = svgEl('g', {}, doc)
  const view = svgEl(
    'rect',
    {
      fill: 'var(--sg-accent-soft, rgba(37,99,235,0.12))',
      stroke: 'var(--sg-accent, #2563eb)',
      'vector-effect': 'non-scaling-stroke',
    },
    doc
  )
  svg.append(bg, items, view)
  host.appendChild(svg)

  /** @type {{ x: number, y: number, w: number, h: number }} */
  let world = { x: 0, y: 0, w: 1, h: 1 }
  let raf = 0

  const draw = () => {
    raf = 0
    theme()
    const rects = graph.rects()
    const visible = visibleRect(graph.transform, graph.size)
    world = expand(/** @type {any} */ (union([...rects, visible])), padding)
    svg.setAttribute('viewBox', `${world.x} ${world.y} ${world.w} ${world.h}`)
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const scale = Math.max(world.w / width, world.h / height)
    items.replaceChildren(
      ...rects.map(r =>
        svgEl(
          'rect',
          {
            x: r.x,
            y: r.y,
            width: r.w,
            height: r.h,
            rx: r.kind === 'node' ? 3 * scale : 0,
            fill:
              r.kind === 'node'
                ? 'var(--sg-node-stroke, #57534e)'
                : r.kind === 'annotation'
                  ? 'var(--sg-sticky, #fef3c7)'
                  : 'none',
            stroke: r.kind === 'frame' ? 'var(--sg-frame-stroke, #a8a29e)' : 'none',
            'stroke-width': scale,
            opacity: r.ghost ? 0.3 : r.kind === 'node' ? 0.7 : 1,
          },
          doc
        )
      )
    )
    view.setAttribute('x', String(visible.x))
    view.setAttribute('y', String(visible.y))
    view.setAttribute('width', String(visible.w))
    view.setAttribute('height', String(visible.h))
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw)
  }

  const toWorld = event => {
    const box = svg.getBoundingClientRect()
    const scale = Math.max(world.w / box.width, world.h / box.height)
    const offsetX = (box.width - world.w / scale) / 2
    const offsetY = (box.height - world.h / scale) / 2
    return {
      x: world.x + (event.clientX - box.left - offsetX) * scale,
      y: world.y + (event.clientY - box.top - offsetY) * scale,
    }
  }
  let dragging = false
  const onDown = event => {
    dragging = true
    svg.setPointerCapture?.(event.pointerId)
    graph.centerOn(toWorld(event))
  }
  const onMove = event => {
    if (dragging) graph.centerOn(toWorld(event))
  }
  const onUp = () => {
    dragging = false
  }
  svg.addEventListener('pointerdown', onDown)
  svg.addEventListener('pointermove', onMove)
  svg.addEventListener('pointerup', onUp)
  svg.addEventListener('pointercancel', onUp)

  const offs = [graph.on('render', schedule), graph.on('transform', schedule)]
  draw()

  return {
    element: svg,
    refresh: draw,
    destroy() {
      cancelAnimationFrame(raf)
      for (const off of offs) off()
      svg.remove()
    },
  }
}
