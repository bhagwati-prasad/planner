/**
 * Graph data: what a host hands to `setData`, normalised with defaults and checked. The
 * graph renders from this and never changes it; changes come back as intents.
 *
 * All coordinates are absolute world units. Ids are unique across every kind, because
 * selection mixes nodes, edges, frames and annotations.
 *
 * @typedef {import('./geometry.js').Rect} Rect
 * @typedef {import('./geometry.js').PortSpec} PortSpec
 *
 * @typedef {object} NodeData
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} [w]
 * @property {number} [h]
 * @property {string} [shape]     registered shape name (default 'box')
 * @property {string} [label]
 * @property {string} [sublabel]  secondary line, e.g. the component type
 * @property {string} [icon]      SVG markup; sanitised before use
 * @property {PortSpec[]} [ports] overrides the shape's ports
 * @property {Record<string, string|number>} [style]  fill, stroke, dash, opacity, ...
 * @property {string|number} [badge]
 * @property {string} [parent]    frame id
 * @property {string} [layer]
 * @property {boolean} [ghost]    faded context node, not interactive (spec §6 "context ghosts")
 * @property {boolean} [locked]   selectable but not movable
 * @property {boolean} [composite] can be opened (drill-down)
 * @property {string} [title]     accessible description
 *
 * @typedef {{ node: string, port?: string|null }} EndRef
 *
 * @typedef {object} EdgeData
 * @property {string} id
 * @property {EndRef|string} source
 * @property {EndRef|string} target
 * @property {'straight'|'orthogonal'|'curved'} [routing]
 * @property {{x: number, y: number}[]} [waypoints]
 * @property {string} [label]
 * @property {Record<string, string|number>} [style]  stroke, dash, width
 * @property {boolean} [arrow]
 * @property {string} [layer]
 *
 * @typedef {object} FrameData
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {string} [label]
 * @property {'group'|'trust-boundary'|'zone'|'system'} [kind]
 * @property {string} [parent]
 * @property {string} [layer]
 * @property {Record<string, string|number>} [style]
 * @property {boolean} [locked]
 *
 * @typedef {object} AnnotationData
 * @property {string} id
 * @property {'sticky'|'text'|'callout'|'region'|'shape'} [kind]
 * @property {number} x
 * @property {number} y
 * @property {number} [w]
 * @property {number} [h]
 * @property {string} [text]
 * @property {{x: number, y: number}|string} [target]  callouts: a point or a node id
 * @property {'rect'|'ellipse'|'diamond'} [form]      shapes
 * @property {string} [parent]
 * @property {string} [layer]
 * @property {Record<string, string|number>} [style]
 *
 * @typedef {object} LayerData
 * @property {string} id
 * @property {boolean} [hidden]
 * @property {boolean} [locked]
 *
 * @typedef {object} GraphData
 * @property {NodeData[]} [nodes]
 * @property {EdgeData[]} [edges]
 * @property {FrameData[]} [frames]
 * @property {AnnotationData[]} [annotations]
 * @property {LayerData[]} [layers]
 */

import { containsPoint, union } from './geometry.js'

export const DEFAULT_NODE_SIZE = Object.freeze({ w: 160, h: 64 })
const ANNOTATION_SIZE = { sticky: { w: 160, h: 120 }, text: { w: 160, h: 32 }, callout: { w: 160, h: 64 }, region: { w: 240, h: 160 }, shape: { w: 120, h: 80 } }
export const FRAME_KINDS = Object.freeze(['group', 'trust-boundary', 'zone', 'system'])
export const ANNOTATION_KINDS = Object.freeze(Object.keys(ANNOTATION_SIZE))

/**
 * @typedef {'node'|'edge'|'frame'|'annotation'} Kind
 * @typedef {{ kind: Kind, id: string, message: string }} DataProblem
 */

export class GraphModel {
  /** @type {Map<string, Required<Pick<NodeData, 'id'|'x'|'y'|'w'|'h'|'shape'|'label'>> & NodeData & { ports: PortSpec[] }>} */
  nodes = new Map()
  /** @type {Map<string, EdgeData & { source: Required<EndRef>, target: Required<EndRef>, waypoints: {x: number, y: number}[] }>} */
  edges = new Map()
  /** @type {Map<string, FrameData & { kind: string, depth: number }>} */
  frames = new Map()
  /** @type {Map<string, AnnotationData & { kind: string, w: number, h: number }>} */
  annotations = new Map()
  /** @type {Map<string, LayerData>} */
  layers = new Map()
  /** @type {DataProblem[]} */
  problems = []

  /**
   * @param {GraphData} data
   * @param {{ portsOf?: (node: NodeData) => PortSpec[], sizeOf?: (node: NodeData) => {w: number, h: number}, routing?: string }} [options]
   */
  constructor (data = {}, { portsOf = () => [], sizeOf = () => DEFAULT_NODE_SIZE, routing = 'orthogonal' } = {}) {
    const seen = new Set()
    const problem = (kind, id, message) => this.problems.push({ kind, id, message })
    const unique = (kind, item) => {
      if (!item || typeof item.id !== 'string' || !item.id) { problem(kind, String(item?.id), `A ${kind} needs a string id`); return false }
      if (seen.has(item.id)) { problem(kind, item.id, `Duplicate id '${item.id}'`); return false }
      seen.add(item.id)
      return true
    }
    const finite = (kind, item, keys) => {
      for (const key of keys) {
        if (item[key] !== undefined && !Number.isFinite(item[key])) { problem(kind, item.id, `${kind} '${item.id}' has a non-numeric ${key}`); return false }
      }
      return true
    }

    for (const layer of data.layers ?? []) if (layer?.id) this.layers.set(layer.id, { hidden: false, locked: false, ...layer })

    for (const f of data.frames ?? []) {
      if (!unique('frame', f) || !finite('frame', f, ['x', 'y', 'w', 'h'])) continue
      this.frames.set(f.id, { label: '', kind: 'group', parent: undefined, ...f, depth: 0 })
    }
    for (const f of this.frames.values()) {
      if (f.parent && !this.frames.has(f.parent)) { problem('frame', f.id, `Frame '${f.id}' has a missing parent '${f.parent}'`); f.parent = undefined }
    }
    for (const f of this.frames.values()) f.depth = this.#depth(f.id)

    for (const n of data.nodes ?? []) {
      if (!unique('node', n) || !finite('node', n, ['x', 'y', 'w', 'h'])) continue
      const size = sizeOf(n)
      const node = /** @type {any} */ ({ shape: 'box', label: '', ...n, w: n.w ?? size.w, h: n.h ?? size.h, x: n.x ?? 0, y: n.y ?? 0 })
      node.ports = n.ports ?? portsOf(node) ?? []
      if (node.parent && !this.frames.has(node.parent)) { problem('node', n.id, `Node '${n.id}' has a missing parent frame '${n.parent}'`); node.parent = undefined }
      this.nodes.set(n.id, node)
    }

    for (const a of data.annotations ?? []) {
      if (!unique('annotation', a) || !finite('annotation', a, ['x', 'y', 'w', 'h'])) continue
      const kind = a.kind ?? 'sticky'
      const size = ANNOTATION_SIZE[kind] ?? ANNOTATION_SIZE.sticky
      this.annotations.set(a.id, { text: '', ...a, kind, w: a.w ?? size.w, h: a.h ?? size.h })
    }

    for (const e of data.edges ?? []) {
      if (!unique('edge', e)) continue
      const source = endRef(e.source)
      const target = endRef(e.target)
      const bad = [source, target].find(end => !end || !this.nodes.has(end.node))
      if (bad !== undefined) { problem('edge', e.id, `Edge '${e.id}' connects a missing node`); continue }
      const s = /** @type {Required<EndRef>} */ (source)
      const t = /** @type {Required<EndRef>} */ (target)
      for (const end of [s, t]) {
        if (end.port && !this.nodes.get(end.node)?.ports.some(p => p.id === end.port)) {
          problem('edge', e.id, `Edge '${e.id}' uses an unknown port '${end.port}' on '${end.node}'`)
          end.port = null
        }
      }
      this.edges.set(e.id, /** @type {any} */ ({ routing, label: '', arrow: true, ...e, source: s, target: t, waypoints: e.waypoints ?? [] }))
    }
  }

  #depth (frameId, guard = 0) {
    const f = this.frames.get(frameId)
    if (!f?.parent || guard > 64) return 0
    return 1 + this.#depth(f.parent, guard + 1)
  }

  /** @param {string} id */
  kindOf (id) {
    if (this.nodes.has(id)) return 'node'
    if (this.edges.has(id)) return 'edge'
    if (this.frames.has(id)) return 'frame'
    if (this.annotations.has(id)) return 'annotation'
    return null
  }

  /** The item with this id, whatever its kind. @param {string} id */
  get (id) {
    return this.nodes.get(id) ?? this.frames.get(id) ?? this.annotations.get(id) ?? this.edges.get(id)
  }

  /** @param {{ layer?: string }} item */
  isHidden (item) {
    return !!(item.layer && this.layers.get(item.layer)?.hidden)
  }

  /** Locked by itself or by its layer. @param {{ layer?: string, locked?: boolean }} item */
  isLocked (item) {
    return !!(item.locked || (item.layer && this.layers.get(item.layer)?.locked))
  }

  /** Bounding rectangle of a node, frame or annotation. @param {string} id @returns {Rect|null} */
  rectOf (id) {
    const item = this.nodes.get(id) ?? this.frames.get(id) ?? this.annotations.get(id)
    return item ? { x: item.x, y: item.y, w: /** @type {number} */ (item.w), h: /** @type {number} */ (item.h) } : null
  }

  /** Frames, parents before children. */
  framesInOrder () {
    return [...this.frames.values()].sort((a, b) => a.depth - b.depth)
  }

  /**
   * Everything nested inside a frame at any depth (nodes, frames, annotations).
   * @param {string} frameId
   */
  descendants (frameId) {
    const out = []
    const inside = parent => {
      let p = parent
      for (let i = 0; p && i < 64; i++) {
        if (p === frameId) return true
        p = this.frames.get(p)?.parent
      }
      return false
    }
    for (const map of [this.frames, this.nodes, this.annotations]) {
      for (const item of map.values()) if (item.id !== frameId && inside(item.parent)) out.push(item.id)
    }
    return out
  }

  /**
   * The deepest frame containing a point, ignoring some frames (e.g. the ones being moved).
   * @param {{ x: number, y: number }} point
   * @param {Set<string>} [exclude]
   */
  frameAt (point, exclude = new Set()) {
    let best = null
    for (const f of this.frames.values()) {
      if (exclude.has(f.id) || this.isHidden(f) || !containsPoint(f, point)) continue
      if (!best || f.depth > best.depth) best = f
    }
    return best?.id ?? null
  }

  /** Bounds of the given items (default: everything visible). @param {Iterable<string>} [ids] */
  bounds (ids) {
    const rects = []
    const list = ids ? [...ids] : [...this.nodes.keys(), ...this.frames.keys(), ...this.annotations.keys()]
    for (const id of list) {
      const item = this.get(id)
      if (!item || this.isHidden(item)) continue
      const r = this.rectOf(id)
      if (r) rects.push(r)
      else if (this.edges.has(id)) {
        const e = /** @type {any} */ (item)
        for (const end of [e.source, e.target]) {
          const nr = this.rectOf(end.node)
          if (nr) rects.push(nr)
        }
      }
    }
    return union(rects)
  }
}

/** @param {EndRef|string|undefined} ref @returns {EndRef|null} */
function endRef (ref) {
  if (typeof ref === 'string') return { node: ref, port: null }
  if (ref && typeof ref.node === 'string') return { node: ref.node, port: ref.port ?? null }
  return null
}
