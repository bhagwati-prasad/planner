/**
 * Built-in shapes (spec C12: generic shapes; vendor icon packs arrive as plugins). A shape
 * draws the body of a node inside `sel`, a D3 selection of a <g> in node-local coordinates
 * (0,0 is the top-left corner; the node is d.w × d.h). The graph draws the label, ports,
 * icon and badges around it. Hosts add shapes with `graph.registerShape(name, def)`.
 *
 * @typedef {object} ShapeContext
 * @property {Record<string, string>} theme  resolved design tokens
 * @property {number} radius
 *
 * @typedef {object} ShapeDef
 * @property {(sel: any, d: any, ctx: ShapeContext) => void} render
 * @property {(d: any) => import('../geometry.js').PortSpec[]} [ports]  default ports when the node has none
 * @property {{ w: number, h: number }} [size]  default size
 * @property {(d: any) => { x: number, y: number, w: number, h: number }} [labelBox]  where the label goes
 * @property {boolean} [label]  false: the shape draws its own label
 */

const path = (sel, d) => sel.append('path').attr('class', 'sg-shape').attr('d', d)

/** @type {Record<string, ShapeDef>} */
export const BUILTIN_SHAPES = {
  box: {
    render(sel, d, ctx) {
      sel
        .append('rect')
        .attr('class', 'sg-shape')
        .attr('width', d.w)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
    },
  },

  rect: {
    render(sel, d) {
      sel.append('rect').attr('class', 'sg-shape').attr('width', d.w).attr('height', d.h)
    },
  },

  ellipse: {
    render(sel, d) {
      sel
        .append('ellipse')
        .attr('class', 'sg-shape')
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
      sel
        .append('path')
        .attr('class', 'sg-shape sg-shape-detail')
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
      sel
        .append('rect')
        .attr('class', 'sg-shape')
        .attr('width', d.w)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
      const g = sel.append('g').attr('class', 'sg-shape-detail')
      for (let i = 1; i <= 3; i++) {
        g.append('line')
          .attr('x1', d.w - 8 * i - 4)
          .attr('x2', d.w - 8 * i - 4)
          .attr('y1', 8)
          .attr('y2', d.h - 8)
          .attr('stroke', 'currentColor')
          .attr('stroke-width', 1.25)
          .attr('opacity', 0.45)
      }
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
      sel
        .append('path')
        .attr('class', 'sg-shape sg-shape-detail')
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
      sel
        .append('circle')
        .attr('class', 'sg-shape')
        .attr('cx', d.w / 2)
        .attr('cy', r + 1)
        .attr('r', r)
      sel
        .append('rect')
        .attr('class', 'sg-shape')
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
      sel
        .append('rect')
        .attr('class', 'sg-shape')
        .attr('x', 8)
        .attr('width', d.w - 8)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
      for (const y of [d.h * 0.25, d.h * 0.6])
        sel
          .append('rect')
          .attr('class', 'sg-shape')
          .attr('y', y)
          .attr('width', 16)
          .attr('height', Math.min(12, d.h * 0.15))
    },
    labelBox: d => ({ x: 22, y: 4, w: d.w - 28, h: d.h - 8 }),
  },

  /** A component whose type is not installed (spec §7: placeholders keep their properties). */
  placeholder: {
    render(sel, d, ctx) {
      sel
        .append('rect')
        .attr('class', 'sg-shape')
        .attr('width', d.w)
        .attr('height', d.h)
        .attr('rx', ctx.radius)
        .attr('stroke-dasharray', '5 4')
    },
  },

  /** A system's boundary port drawn on its frame edge. */
  'boundary-port': {
    render(sel, d) {
      sel
        .append('rect')
        .attr('class', 'sg-shape')
        .attr('width', d.w)
        .attr('height', d.h)
        .attr('rx', Math.min(d.w, d.h) / 2)
    },
    ports: d => [
      {
        id: 'port',
        side: d.side ?? (d.direction === 'out' ? 'left' : 'right'),
        offset: 0.5,
        direction: d.direction ?? 'both',
      },
    ],
    size: { w: 72, h: 28 },
    labelBox: d => ({ x: 4, y: 0, w: d.w - 8, h: d.h }),
  },
}
