/**
 * DOM helpers: SVG element creation, text measurement and the icon sanitiser.
 */
import { estimateMeasure } from '../text.js'

export const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * @param {string} tag
 * @param {Record<string, string|number>} [attrs]
 * @param {Document} [doc]
 */
export function svgEl(tag, attrs = {}, doc = document) {
  const el = doc.createElementNS(SVG_NS, tag)
  for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, String(val))
  return el
}

/**
 * A width function for a font, backed by a canvas when available.
 * @param {string} fontFamily
 * @param {number} fontSize px
 * @param {string} [weight]
 * @returns {(s: string) => number}
 */
export function createMeasurer(fontFamily, fontSize, weight = '400') {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const ctx = canvas?.getContext?.('2d')
  if (!ctx) return estimateMeasure(fontSize)
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`
  const cache = new Map()
  return s => {
    let w = cache.get(s)
    if (w === undefined) {
      w = ctx.measureText(s).width
      if (cache.size > 5000) cache.clear()
      cache.set(s, w)
    }
    return w
  }
}

const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'title',
  'desc',
  'clippath',
  'mask',
])
const ALLOWED_ATTRS = new Set([
  'd',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'points',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'transform',
  'viewbox',
  'preserveaspectratio',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'clip-rule',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'vector-effect',
  'id',
  'clip-path',
  'mask',
  'xmlns',
])

/**
 * Parses untrusted SVG markup (component icons come from plugins) and keeps only an
 * allowlist of drawing elements and attributes: no scripts, event handlers, links, styles,
 * foreign content or external references. Ids are prefixed so icons cannot collide with the
 * page or each other.
 * @param {string} markup
 * @param {string} idPrefix
 * @returns {SVGSVGElement|null}
 */
export function sanitizeSvg(markup, idPrefix = 'icon') {
  if (typeof markup !== 'string' || !markup.trim() || typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.querySelector('parsererror')) return null
  const clean = el => {
    for (const child of [...el.children]) {
      if (!ALLOWED_TAGS.has(child.localName.toLowerCase())) child.remove()
      else clean(child)
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value
      const external = /url\s*\(\s*['"]?\s*(?!#)/i.test(value) || /javascript:/i.test(value)
      if (!ALLOWED_ATTRS.has(name) || external) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'id') el.setAttribute('id', `${idPrefix}-${value}`)
      if (/url\(\s*#/.test(value))
        el.setAttribute(
          attr.name,
          value.replace(/url\(\s*#([^)\s]+)\s*\)/g, `url(#${idPrefix}-$1)`)
        )
    }
  }
  clean(root)
  return /** @type {SVGSVGElement} */ (/** @type {unknown} */ (document.importNode(root, true)))
}
