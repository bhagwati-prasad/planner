/**
 * Built-in shapes (spec C12: generic shapes; vendor icon packs arrive as plugins). A shape
 * draws the body of a node inside `sel`, a D3 selection of a <g> in node-local coordinates
 * (0,0 is the top-left corner; the node is d.w × d.h). `render` is the D3 enter/update of the
 * body (spec §10): it is called again whenever the node changes, on the same <g>, so it draws
 * through joins and updates its elements instead of appending new ones. The graph draws the
 * label, ports, icon and badges around it, unless the shape draws its own (`label: false`).
 * Hosts add shapes with `graph.registerShape(name, def)`.
 *
 * @typedef {object} ShapeContext
 * @property {Record<string, string>} theme  resolved design tokens
 * @property {number} radius
 * @property {number} fontSize                base font size in px
 * @property {(text: string) => number} measure      text width at the base font
 * @property {(text: string) => number} measureBold  text width at the base font, bold
 * @property {(markup: string) => Element|null} icon  a sanitised copy of an icon's SVG
 *
 * @typedef {object} ShapeDef
 * @property {(sel: any, d: any, ctx: ShapeContext) => void} render
 * @property {(d: any) => import('../geometry.js').PortSpec[]} [ports]  default ports when the node has none
 * @property {{ w: number, h: number }|((d: any) => { w: number, h: number })} [size]  default size
 * @property {(d: any) => { x: number, y: number, w: number, h: number }} [labelBox]  where the label goes
 * @property {boolean} [label]  false: the shape draws its own label
 */

import { truncateText } from '../text.js'

/**
 * The part of a shape named `name`: created on the first render, then updated in place.
 * @param {any} sel the node body
 * @param {string} tag
 * @param {string} name
 * @param {string} [cls]
 */
export function part(sel, tag, name, cls = 'sg-shape') {
  return sel
    .selectChildren(`[data-part="${name}"]`)
    .data([name])
    .join(tag)
    .attr('data-part', name)
    .attr('class', cls)
}

/** @param {any} sel @param {string} d */
const path = (sel, d) => part(sel, 'path', 'outline').attr('d', d)

/**
 * A boundary port on each side of a level frame, in its 12 × 12 box: the half-disc (flat side on
 * the frame edge through the box's centre), where its label goes outside the frame, and the side
 * its connection faces.
 */
const BP_SIDES =
  /** @type {Record<string, { disc: string, label: [number, number, string, string], inward: import('../geometry.js').Side }>} */ ({
    left: { disc: 'M6,0A6,6 0 0 1 6,12Z', label: [0, 6, 'end', 'central'], inward: 'right' },
    right: { disc: 'M6,12A6,6 0 0 1 6,0Z', label: [12, 6, 'start', 'central'], inward: 'left' },
    top: { disc: 'M12,6A6,6 0 0 1 0,6Z', label: [6, -4, 'middle', 'auto'], inward: 'bottom' },
    bottom: { disc: 'M0,6A6,6 0 0 1 12,6Z', label: [6, 16, 'middle', 'hanging'], inward: 'top' },
  })

/** Badges shown on a card: up to three, then "+N" for the rest (design system §6). */
const MAX_BADGES = 3

/** @type {Record<string, ShapeDef>} */
export const BUILTIN_SHAPES = {
  /**
   * The default component (design system §6): an icon tile, a one-line title with an ellipsis
   * (the full name is in the node's tooltip), a subtitle, and up to three badges then "+N" at
   * the top right. A component with an inner system is larger, shows two stratum outlines
   * behind it and a stack glyph on its tile.
   */
  card: {
    size: d => (d.composite ? { w: 208, h: 64 } : { w: 184, h: 56 }),
    label: false,
    render(sel, d, ctx) {
      const pad = 12
      const tileSize = 32
      part(sel, 'g', 'strata', 'sg-strata')
        .selectChildren('rect')
        .data(d.composite ? [2, 1] : [])
        .join('rect')
        .attr('class', 'sg-stratum')
        .attr('x', i => i * 3)
        .attr('y', i => -i * 3)
        .attr('width', d.w)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
      part(sel, 'rect', 'outline').attr('width', d.w).attr('height', d.h).attr('rx', ctx.radius)

      const tile = part(sel, 'g', 'tile', 'sg-icon-tile').attr(
        'transform',
        `translate(${pad},${(d.h - tileSize) / 2})`
      )
      part(tile, 'rect', 'tile', 'sg-icon-tile-bg')
        .attr('width', tileSize)
        .attr('height', tileSize)
        .attr('rx', 4)
      tile
        .selectChildren('svg.sg-icon')
        .data(d.icon && !d.missing && ctx.icon(d.icon) ? [d.icon] : [], m => m)
        .join(enter => enter.append(m => /** @type {Element} */ (ctx.icon(m))))
        .attr('class', 'sg-icon')
        .attr('x', 4)
        .attr('y', 4)
        .attr('width', 24)
        .attr('height', 24)
      // A missing component shows a warning glyph in place of its icon.
      tile
        .selectChildren('path.sg-warning-glyph')
        .data(d.missing ? [0] : [])
        .join('path')
        .attr('class', 'sg-warning-glyph')
        .attr('d', 'M16,7 L26,24 H6 Z M16,13 V18.5 M16,21 V21.5')
      tile
        .selectChildren('path.sg-stack')
        .data(d.composite ? [0] : [])
        .join('path')
        .attr('class', 'sg-stack')
        .attr('d', 'M22,24 h7 M22,27 h7 M22,30 h7')

      // Badges straddle the top edge at the right, so they never crowd the title.
      const all = Array.isArray(d.badges) ? d.badges.map(String) : []
      const shown =
        all.length > MAX_BADGES ? [...all.slice(0, MAX_BADGES), `+${all.length - MAX_BADGES}`] : all
      const widths = shown.map(t => Math.max(16, ctx.measure(t) + 8))
      let right = d.w - 8
      const lefts = widths.map(w => (right -= w + 4) + 4)
      const badges = part(sel, 'g', 'badges', 'sg-card-badges')
        .selectChildren('g.sg-card-badge')
        .data(shown)
        .join(enter => {
          const g = enter.append('g').attr('class', 'sg-card-badge')
          g.append('rect').attr('height', 16).attr('rx', 8)
          g.append('text')
          return g
        })
        .attr('transform', (_, i) => `translate(${lefts[i]},-8)`)
      badges.select('rect').attr('width', (_, i) => widths[i])
      badges
        .select('text')
        .attr('x', (_, i) => widths[i] / 2)
        .attr('y', 8)
        .text(t => t)

      // Title and subtitle, left-aligned after the tile.
      const x = pad + tileSize + 10
      const title = truncateText(d.label ?? '', d.w - pad - x, ctx.measureBold)
      const subtitle = truncateText(
        d.missing ? `Missing: ${d.missing}` : (d.sublabel ?? ''),
        d.w - pad - x,
        ctx.measure
      )
      part(sel, 'text', 'title', 'sg-label sg-title')
        .attr('x', x)
        .attr('y', subtitle ? d.h / 2 - 8 : d.h / 2)
        .text(title)
      part(sel, 'text', 'subtitle', 'sg-sublabel sg-subtitle')
        .attr('x', x)
        .attr('y', d.h / 2 + 9)
        .text(subtitle)
    },
  },

  box: {
    render(sel, d, ctx) {
      part(sel, 'rect', 'outline').attr('width', d.w).attr('height', d.h).attr('rx', ctx.radius)
    },
  },

  rect: {
    render(sel, d) {
      part(sel, 'rect', 'outline').attr('width', d.w).attr('height', d.h)
    },
  },

  ellipse: {
    render(sel, d) {
      part(sel, 'ellipse', 'outline')
        .attr('cx', d.w / 2)
        .attr('cy', d.h / 2)
        .attr('rx', d.w / 2)
        .attr('ry', d.h / 2)
    },
    labelBox: d => ({ x: d.w * 0.15, y: d.h * 0.15, w: d.w * 0.7, h: d.h * 0.7 }),
  },

  diamond: {
    render(sel, d) {
      path(sel, `M${d.w / 2},0 L${d.w},${d.h / 2} L${d.w / 2},${d.h} L0,${d.h / 2} Z`)
    },
    labelBox: d => ({ x: d.w * 0.25, y: d.h * 0.25, w: d.w * 0.5, h: d.h * 0.5 }),
    size: { w: 120, h: 80 },
  },

  hexagon: {
    render(sel, d) {
      const i = Math.min(d.w * 0.2, d.h / 2)
      path(
        sel,
        `M${i},0 L${d.w - i},0 L${d.w},${d.h / 2} L${d.w - i},${d.h} L${i},${d.h} L0,${d.h / 2} Z`
      )
    },
    labelBox: d => ({ x: d.w * 0.2, y: 4, w: d.w * 0.6, h: d.h - 8 }),
  },

  /** Database: a cylinder. */
  cylinder: {
    render(sel, d) {
      const ry = Math.min(10, d.h / 6)
      path(
        sel,
        `M0,${ry} A${d.w / 2},${ry} 0 0 1 ${d.w},${ry} L${d.w},${d.h - ry} A${d.w / 2},${ry} 0 0 1 0,${d.h - ry} Z`
      )
      part(sel, 'path', 'lid', 'sg-shape sg-shape-detail')
        .attr('fill', 'none')
        .attr('d', `M0,${ry} A${d.w / 2},${ry} 0 0 0 ${d.w},${ry}`)
    },
    labelBox: d => ({
      x: 6,
      y: Math.min(10, d.h / 6) * 2,
      w: d.w - 12,
      h: d.h - Math.min(10, d.h / 6) * 3,
    }),
    size: { w: 140, h: 80 },
  },

  /** Queue: a box with stacked message slots on the right. */
  queue: {
    render(sel, d, ctx) {
      part(sel, 'rect', 'outline').attr('width', d.w).attr('height', d.h).attr('rx', ctx.radius)
      part(sel, 'g', 'slots', 'sg-shape-detail')
        .selectChildren('line')
        .data([1, 2, 3])
        .join('line')
        .attr('x1', i => d.w - 8 * i - 4)
        .attr('x2', i => d.w - 8 * i - 4)
        .attr('y1', 8)
        .attr('y2', d.h - 8)
        .attr('stroke', 'currentColor')
        .attr('stroke-width', 1.25)
        .attr('opacity', 0.45)
    },
    labelBox: d => ({ x: 8, y: 4, w: d.w - 44, h: d.h - 8 }),
  },

  document: {
    render(sel, d) {
      const wave = Math.min(8, d.h / 6)
      path(
        sel,
        `M0,0 L${d.w},0 L${d.w},${d.h - wave} C${d.w * 0.75},${d.h - 2.5 * wave} ${d.w * 0.25},${d.h + wave} 0,${d.h - wave} Z`
      )
    },
    labelBox: d => ({ x: 8, y: 4, w: d.w - 16, h: d.h - 16 }),
  },

  note: {
    render(sel, d) {
      const f = Math.min(14, d.w / 4, d.h / 4)
      path(sel, `M0,0 L${d.w - f},0 L${d.w},${f} L${d.w},${d.h} L0,${d.h} Z`)
      part(sel, 'path', 'fold', 'sg-shape sg-shape-detail')
        .attr('fill', 'none')
        .attr('d', `M${d.w - f},0 L${d.w - f},${f} L${d.w},${f}`)
    },
  },

  /** External system: a cloud. */
  cloud: {
    render(sel, d) {
      const { w, h } = d
      path(
        sel,
        [
          `M${w * 0.25},${h * 0.85}`,
          `C${w * 0.02},${h * 0.85} ${w * 0.02},${h * 0.45} ${w * 0.22},${h * 0.45}`,
          `C${w * 0.22},${h * 0.1} ${w * 0.55},${h * 0.05} ${w * 0.62},${h * 0.3}`,
          `C${w * 0.75},${h * 0.15} ${w * 0.95},${h * 0.3} ${w * 0.85},${h * 0.5}`,
          `C${w * 1.02},${h * 0.55} ${w * 0.98},${h * 0.9} ${w * 0.78},${h * 0.85}`,
          'Z',
        ].join(' ')
      )
    },
    labelBox: d => ({ x: d.w * 0.18, y: d.h * 0.35, w: d.w * 0.64, h: d.h * 0.45 }),
    size: { w: 160, h: 90 },
  },

  /** Client or user: a person. */
  person: {
    render(sel, d) {
      const r = Math.min(d.h * 0.18, d.w * 0.15)
      part(sel, 'circle', 'head')
        .attr('cx', d.w / 2)
        .attr('cy', r + 1)
        .attr('r', r)
      part(sel, 'rect', 'outline')
        .attr('y', r * 2 + 4)
        .attr('width', d.w)
        .attr('height', d.h - r * 2 - 4)
        .attr('rx', Math.min(16, d.h / 4))
    },
    labelBox: d => {
      const top = Math.min(d.h * 0.18, d.w * 0.15) * 2 + 4
      return { x: 8, y: top, w: d.w - 16, h: d.h - top }
    },
    size: { w: 140, h: 100 },
  },

  /** Component (UML style): a box with two tabs on the left edge. */
  component: {
    render(sel, d, ctx) {
      part(sel, 'rect', 'outline')
        .attr('x', 8)
        .attr('width', d.w - 8)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
      for (const [i, y] of [d.h * 0.25, d.h * 0.6].entries())
        part(sel, 'rect', `tab${i}`)
          .attr('y', y)
          .attr('width', 16)
          .attr('height', Math.min(12, d.h * 0.15))
    },
    labelBox: d => ({ x: 22, y: 4, w: d.w - 28, h: d.h - 8 }),
  },

  /** A component whose type is not installed (spec §7: placeholders keep their properties). */
  placeholder: {
    render(sel, d, ctx) {
      part(sel, 'rect', 'outline')
        .attr('width', d.w)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
        .attr('stroke-dasharray', '5 4')
    },
  },

  /**
   * A system's boundary port on its level frame (design system §6): a 12 px half-disc whose flat
   * side lies on the frame's edge and which bulges into the level, labelled outside the frame.
   * `side` names the frame's side it sits on; the host centres it on that edge.
   */
  'boundary-port': {
    render(sel, d) {
      const side = BP_SIDES[d.side] ? d.side : 'left'
      part(sel, 'path', 'disc', 'sg-bp-disc').attr('d', BP_SIDES[side].disc)
      const [x, y, anchor, baseline] = BP_SIDES[side].label
      part(sel, 'text', 'label', 'sg-bp-label')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', baseline)
        .text(d.label ?? '')
    },
    ports: d => [
      {
        id: 'port',
        side: BP_SIDES[d.side]?.inward ?? 'right',
        offset: 0.5,
        direction: d.direction ?? 'both',
      },
    ],
    size: { w: 12, h: 12 },
    label: false,
  },
}
