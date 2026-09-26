/**
 * View adapter (spec §4, §9): the one place the model and the diagram meet. strata-graph
 * knows nothing about Strata; this module turns the current system (through the strata
 * facade, never the core) into graph data, and graph intents back into commands.
 *
 * Besides the system's own nodes and edges it draws:
 *   - a system frame, with the system's boundary ports on its edge (spec §6 "Boundary ports");
 *   - the edges that map each boundary port to the internal port it serves;
 *   - context ghosts: the parent's neighbours, faded, outside the frame (spec §6 "Drill-down").
 * These synthetic items carry prefixed ids (see `ids`) so intents about them can be routed.
 */
import { BUILTIN_SHAPES, DEFAULT_NODE_SIZE } from '../../strata-graph/src/index.js'

/** Shapes for the built-in base types; a manifest's own `shape` wins. */
export const SHAPE_BY_BASE = Object.freeze({
  'base:store': 'cylinder',
  'base:queue': 'queue',
  'base:topic': 'queue',
  'base:client': 'person',
  'base:external': 'cloud',
  'base:proxy': 'hexagon',
  'base:cache': 'component',
  'base:timer': 'ellipse',
  'base:service': 'box'
})

/** Where a port sits when its manifest does not say. */
export const SIDE_BY_DIRECTION = Object.freeze({ in: 'left', out: 'right', both: 'bottom' })

/** Connection types drawn dashed (asynchronous traffic). */
const DASHED_TYPES = new Set(['async-message'])

const FRAME_PADDING = 60
const MIN_FRAME = { w: 480, h: 320 }
const BP_SIZE = { w: 96, h: 28 }
const GHOST_GAP = 200
const AUTO = { columns: 4, dx: 220, dy: 140, gap: 80 }

/** Prefixes for the synthetic items the adapter adds. */
export const ids = Object.freeze({
  frame: systemId => `frame:${systemId}`,
  bp: bpId => `bp:${bpId}`,
  map: bpId => `map:${bpId}`,
  ghost: nodeId => `ghost:${nodeId}`,
  ghostEdge: edgeId => `ghostedge:${edgeId}`
})

/**
 * @param {string} id a graph id
 * @returns {{ kind: 'model'|'frame'|'bp'|'map'|'ghost'|'ghostedge', id: string }}
 */
export function parseId (id) {
  const m = /^(frame|bp|map|ghost|ghostedge):(.+)$/.exec(id)
  return m ? { kind: /** @type {any} */ (m[1]), id: m[2] } : { kind: 'model', id }
}

/** Default size of a shape. @param {string} shape */
export function shapeSize (shape) {
  return BUILTIN_SHAPES[shape]?.size ?? DEFAULT_NODE_SIZE
}

/**
 * The shape for a node: composites are boxes; atomic nodes use the manifest's shape, else
 * the first base type in their lineage, else a box; missing components are placeholders.
 * @param {import('../../strata/src/index.js').NodeHandle} node
 */
export function shapeFor (node) {
  if (node.isComposite) return 'box'
  const manifest = node.manifest
  if (!manifest) return 'placeholder'
  if (typeof manifest.shape === 'string') return manifest.shape
  for (const id of manifest.lineage ?? []) if (SHAPE_BY_BASE[id]) return SHAPE_BY_BASE[id]
  return 'box'
}

/**
 * @typedef {object} GraphView
 * @property {import('../../strata-graph/src/data.js').GraphData} data
 * @property {string|null} viewId
 * @property {Record<string, {x: number, y: number}>} autoPlaced  nodes positioned by the adapter (not yet in the view)
 */

/**
 * Graph data for a system in one of its views.
 * @param {import('../../strata/src/index.js').SystemHandle} system
 * @param {{ viewId?: string }} [options]
 * @returns {GraphView}
 */
export function toGraphData (system, { viewId } = {}) {
  const views = system.views()
  const view = views.find(v => v.id === viewId) ?? views[0] ?? null
  const layout = view?.layout ?? {}
  const hidden = new Set(view?.hidden ?? [])
  const nodes = system.nodes().filter(n => !hidden.has(n.id))

  // Positions: from the view, else placed on a grid below what is already laid out.
  const shapes = new Map(nodes.map(n => [n.id, shapeFor(n)]))
  const sizeOf = n => {
    const entry = layout[n.id]
    const base = shapeSize(/** @type {string} */ (shapes.get(n.id)))
    return { w: entry?.w ?? base.w, h: entry?.h ?? base.h }
  }
  const placed = nodes.filter(n => typeof layout[n.id]?.x === 'number')
  const bottom = placed.length ? Math.max(...placed.map(n => layout[n.id].y + sizeOf(n).h)) : null
  const left = placed.length ? Math.min(...placed.map(n => layout[n.id].x)) : 40
  /** @type {Record<string, {x: number, y: number}>} */
  const autoPlaced = {}
  let slot = 0
  for (const n of nodes) {
    if (typeof layout[n.id]?.x === 'number') continue
    const col = slot % AUTO.columns
    const row = Math.floor(slot / AUTO.columns)
    autoPlaced[n.id] = { x: left + col * AUTO.dx, y: (bottom === null ? 40 : bottom + AUTO.gap) + row * AUTO.dy }
    slot++
  }
  const positionOf = n => (typeof layout[n.id]?.x === 'number' ? { x: layout[n.id].x, y: layout[n.id].y } : autoPlaced[n.id])

  /** @type {import('../../strata-graph/src/data.js').NodeData[]} */
  const graphNodes = nodes.map(n => {
    const pos = positionOf(n)
    const size = sizeOf(n)
    const e = n.entity
    const manifestPorts = new Map((n.manifest?.ports ?? []).map(p => [p.name, p]))
    return {
      id: n.id,
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      shape: /** @type {string} */ (shapes.get(n.id)),
      label: e.name,
      sublabel: sublabelFor(n),
      composite: n.isComposite,
      icon: typeof n.manifest?.iconSvg === 'string' ? n.manifest.iconSvg : undefined,
      layer: layout[n.id]?.layer,
      style: view?.styles?.[n.id],
      title: `${e.name}${e.status !== 'planned' ? `, ${e.status}` : ''}`,
      ports: n.ports().map(p => {
        const pe = p.entity
        return {
          id: pe.id,
          side: manifestPorts.get(pe.name)?.side ?? SIDE_BY_DIRECTION[pe.direction],
          direction: pe.direction,
          label: `${pe.name}${p.accepts.length ? ` (${p.accepts.join(', ')})` : ''}`
        }
      })
    }
  })
  const shown = new Set(graphNodes.map(n => n.id))

  /** @type {import('../../strata-graph/src/data.js').EdgeData[]} */
  const graphEdges = []
  for (const edge of system.edges()) {
    const e = edge.entity
    if (hidden.has(e.id)) continue
    const from = edge.from
    const to = edge.to
    const fromNode = from.entity.nodeId
    const toNode = to.entity.nodeId
    if (!shown.has(fromNode) || !shown.has(toNode)) continue
    graphEdges.push({
      id: e.id,
      source: { node: fromNode, port: e.fromPort },
      target: { node: toNode, port: e.toPort },
      label: e.label || undefined,
      waypoints: layout[e.id]?.waypoints,
      style: { ...(DASHED_TYPES.has(e.connectionType) ? { dash: '6 4' } : {}), ...(view?.styles?.[e.id] ?? {}) },
      layer: layout[e.id]?.layer
    })
  }

  /** @type {import('../../strata-graph/src/data.js').FrameData[]} */
  const frames = []
  const bps = system.ports()
  const via = system.via
  if (!system.isRoot || bps.length || via) {
    const frame = frameAround(graphNodes, system)
    frames.push(frame)
    placeBoundaryPorts(frame, bps, graphNodes, graphEdges)
    if (via) addGhosts(frame, via, bps, graphNodes, graphEdges)
  }

  return {
    data: {
      nodes: graphNodes,
      edges: graphEdges,
      frames,
      annotations: [],
      layers: (view?.layers ?? []).map(l => ({ id: l.id, hidden: !!l.hidden, locked: !!l.locked }))
    },
    viewId: view?.id ?? null,
    autoPlaced
  }
}

/** @param {import('../../strata/src/index.js').NodeHandle} node */
function sublabelFor (node) {
  if (node.isComposite) {
    const child = node.child
    const count = child.nodes().length
    return `▣ ${node.placement === 'reference' ? `${child.name} (reference)` : `${count} node${count === 1 ? '' : 's'}`}`
  }
  const manifest = node.manifest
  return manifest ? manifest.name : `${node.type} (not installed)`
}

/** The frame drawn around a system's contents when you are inside it. */
function frameAround (nodes, system) {
  let x1 = 0; let y1 = 0; let x2 = MIN_FRAME.w - 2 * FRAME_PADDING; let y2 = MIN_FRAME.h - 2 * FRAME_PADDING
  if (nodes.length) {
    x1 = Math.min(...nodes.map(n => n.x))
    y1 = Math.min(...nodes.map(n => n.y))
    x2 = Math.max(...nodes.map(n => n.x + /** @type {number} */ (n.w)))
    y2 = Math.max(...nodes.map(n => n.y + /** @type {number} */ (n.h)))
  }
  let w = x2 - x1 + 2 * FRAME_PADDING
  let h = y2 - y1 + 2 * FRAME_PADDING
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  w = Math.max(w, MIN_FRAME.w)
  h = Math.max(h, MIN_FRAME.h)
  const e = system.entity
  return {
    id: ids.frame(system.id),
    kind: /** @type {const} */ ('system'),
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    w: Math.round(w),
    h: Math.round(h),
    label: `${e.name}${e.levelTag ? ` · ${e.levelTag}` : ''}${system.readOnly ? ' · read-only' : ''}`,
    locked: true
  }
}

/**
 * Boundary ports sit on the frame: inputs on the left edge, outputs on the right, level with
 * the node they map to when possible.
 */
function placeBoundaryPorts (frame, bps, nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const sides = { left: [], right: [] }
  for (const bp of bps) {
    const e = bp.entity
    const internal = bp.internal
    const target = internal ? byId.get(internal.entity.nodeId) : null
    const y = target ? target.y + /** @type {number} */ (target.h) / 2 - BP_SIZE.h / 2 : null
    sides[e.direction === 'out' ? 'right' : 'left'].push({ bp, e, internal, y })
  }
  for (const [side, list] of Object.entries(sides)) {
    // Unmapped ports fill the gaps top-down; overlapping ones are pushed down.
    let nextFree = frame.y + FRAME_PADDING / 2
    list.sort((a, b) => (a.y ?? Infinity) - (b.y ?? Infinity))
    for (const item of list) {
      const y = Math.max(item.y ?? nextFree, nextFree)
      nextFree = y + BP_SIZE.h + 12
      const x = side === 'left' ? frame.x - BP_SIZE.w / 2 : frame.x + frame.w - BP_SIZE.w / 2
      // Inside the system an input boundary port is where traffic comes from.
      const direction = item.e.direction === 'in' ? 'out' : item.e.direction === 'out' ? 'in' : 'both'
      nodes.push({
        id: ids.bp(item.e.id),
        x,
        y,
        w: BP_SIZE.w,
        h: BP_SIZE.h,
        shape: 'boundary-port',
        label: item.e.name,
        locked: true,
        title: `Boundary port ${item.e.name} (${item.e.direction})`,
        ports: [{ id: 'port', side: side === 'left' ? 'right' : 'left', offset: 0.5, direction, label: item.e.name }]
      })
      if (item.internal && byId.has(item.internal.entity.nodeId)) {
        const inner = { node: item.internal.entity.nodeId, port: item.internal.id }
        const outer = { node: ids.bp(item.e.id), port: 'port' }
        edges.push({
          id: ids.map(item.e.id),
          source: item.e.direction === 'out' ? inner : outer,
          target: item.e.direction === 'out' ? outer : inner,
          style: { dash: '3 3' }
        })
      }
    }
  }
}

/**
 * Context ghosts: the parent's nodes connected to this composite, drawn outside the frame
 * next to the boundary port their traffic uses.
 */
function addGhosts (frame, via, bps, nodes, edges) {
  const bpNodes = new Map(nodes.filter(n => n.id.startsWith('bp:')).map(n => [n.id, n]))
  const placed = new Map()
  const nextY = { left: frame.y, right: frame.y }
  for (const mirror of via.ports()) {
    const bpId = mirror.entity.boundaryPortId
    const bpNode = bpId ? bpNodes.get(ids.bp(bpId)) : null
    if (!bpNode) continue
    for (const edge of mirror.edges()) {
      const e = edge.entity
      const incoming = e.toPort === mirror.id
      const other = incoming ? edge.from : edge.to
      const neighbour = other.node
      const side = incoming ? 'left' : 'right'
      let ghost = placed.get(neighbour.id)
      if (!ghost) {
        const shape = shapeFor(neighbour)
        const size = shapeSize(shape)
        const y = Math.max(bpNode.y + BP_SIZE.h / 2 - size.h / 2, nextY[side])
        nextY[side] = y + size.h + 24
        ghost = {
          id: ids.ghost(neighbour.id),
          x: side === 'left' ? frame.x - GHOST_GAP - size.w : frame.x + frame.w + GHOST_GAP,
          y,
          w: size.w,
          h: size.h,
          shape,
          label: neighbour.name,
          sublabel: `in ${neighbour.system.name}`,
          ghost: true,
          ports: [{ id: 'g', side: side === 'left' ? 'right' : 'left', offset: 0.5 }]
        }
        placed.set(neighbour.id, ghost)
        nodes.push(ghost)
      }
      const g = { node: ghost.id, port: 'g' }
      const b = { node: bpNode.id, port: 'port' }
      edges.push({ id: ids.ghostEdge(e.id), source: incoming ? g : b, target: incoming ? b : g, label: e.label || undefined })
    }
  }
}

/**
 * @typedef {object} IntentResult
 * @property {string[]} [select]     graph ids to show as selected
 * @property {string} [enter]        composite node id to drill into
 * @property {string} [inspect]      id to show in the inspector
 * @property {{ source: { node: string, port: string|null }, x: number, y: number }} [quickAdd]  connect-to-point: offer to add a component there
 * @property {{ id: string|null, kind: string|null, clientX: number, clientY: number, x: number, y: number }} [contextMenu]
 */

/**
 * Applies a graph intent to the model. Selection, navigation and menus are UI state, so they
 * come back as instructions instead of commands.
 * @param {any} intent
 * @param {{ strata: import('../../strata/src/index.js').Strata, system: import('../../strata/src/index.js').SystemHandle, viewId: string|null }} context
 * @returns {IntentResult}
 */
export function applyIntent (intent, { strata, system, viewId }) {
  const project = system.project
  const layoutCommand = set => ({ type: 'view.layout', payload: { viewId, set } })
  const modelIds = list => list.map(parseId).filter(p => p.kind === 'model').map(p => p.id)
  const readOnly = () => {
    if (system.readOnly) throw Object.assign(new Error(`'${system.name}' is placed by reference and is read-only here`), { code: 'READ_ONLY' })
  }

  switch (intent.type) {
    case 'select': {
      const real = modelIds(intent.ids).filter(id => isNodeOrEdge(system, id))
      strata.select(real)
      return { select: intent.ids }
    }
    case 'move': {
      readOnly()
      const set = {}
      for (const item of intent.items) {
        const p = parseId(item.id)
        if (p.kind === 'model' && item.kind === 'node') set[p.id] = { x: item.x, y: item.y }
      }
      if (viewId && Object.keys(set).length) project.dispatch(layoutCommand(set))
      return {}
    }
    case 'resize': {
      readOnly()
      const p = parseId(intent.id)
      if (p.kind === 'model' && viewId) project.dispatch(layoutCommand({ [p.id]: { x: intent.x, y: intent.y, w: intent.w, h: intent.h } }))
      return {}
    }
    case 'connect': {
      readOnly()
      const s = parseId(intent.source.node)
      const t = parseId(intent.target.node)
      if (s.kind === 'model' && t.kind === 'model') {
        system.connect(intent.source.port, intent.target.port)
      } else if (s.kind === 'bp' && t.kind === 'model') {
        project.dispatch({ type: 'boundary.update', payload: { id: s.id, changes: { internalPortId: intent.target.port } } })
      } else if (s.kind === 'model' && t.kind === 'bp') {
        project.dispatch({ type: 'boundary.update', payload: { id: t.id, changes: { internalPortId: intent.source.port } } })
      }
      return {}
    }
    case 'reconnect': {
      readOnly()
      const e = parseId(intent.edge)
      const to = parseId(intent.to.node)
      if (e.kind === 'model' && to.kind === 'model') {
        project.dispatch({ type: 'edge.rewire', payload: { id: e.id, [intent.end === 'source' ? 'fromPort' : 'toPort']: intent.to.port } })
      } else if (e.kind === 'map' && to.kind === 'model') {
        project.dispatch({ type: 'boundary.update', payload: { id: e.id, changes: { internalPortId: intent.to.port } } })
      }
      return {}
    }
    case 'waypoints': {
      readOnly()
      const e = parseId(intent.edge)
      if (e.kind === 'model' && viewId) project.dispatch(layoutCommand({ [e.id]: { waypoints: intent.waypoints } }))
      return {}
    }
    case 'delete': {
      readOnly()
      const parsed = intent.ids.map(parseId)
      const nodes = new Set(parsed.filter(p => p.kind === 'model' && isNode(system, p.id)).map(p => p.id))
      project.transaction(() => {
        for (const p of parsed) {
          if (p.kind === 'model' && nodes.has(p.id)) project.dispatch({ type: 'node.remove', payload: { id: p.id } })
        }
        for (const p of parsed) {
          if (p.kind === 'model' && !nodes.has(p.id) && edgeExists(system, p.id)) project.dispatch({ type: 'edge.remove', payload: { id: p.id } })
          if (p.kind === 'bp') project.dispatch({ type: 'boundary.remove', payload: { id: p.id } })
          if (p.kind === 'map' && bpExists(system, p.id)) project.dispatch({ type: 'boundary.update', payload: { id: p.id, changes: { internalPortId: null } } })
        }
      }, { label: 'Delete' })
      return { select: [] }
    }
    case 'open': {
      const p = parseId(intent.id)
      if (p.kind === 'model' && intent.kind === 'node') {
        const node = system.project.node(p.id)
        if (node.isComposite) return { enter: p.id }
        return { inspect: p.id }
      }
      if (p.kind === 'ghost') return { inspect: p.id }
      return { inspect: intent.id }
    }
    case 'drop': {
      readOnly()
      const data = intent.data ?? {}
      const at = { x: Math.round((intent.x - 80) / 10) * 10, y: Math.round((intent.y - 32) / 10) * 10 }
      if (typeof data.typeRef === 'string') {
        const node = system.add(data.typeRef, { at })
        return { select: [node.id] }
      }
      if (typeof data.systemRef === 'string') {
        const node = system.place(data.systemRef, { placement: data.placement ?? 'reference', at })
        return { select: [node.id] }
      }
      return {}
    }
    case 'connect-to-point':
      if (system.readOnly) return {}
      return { quickAdd: { source: intent.source, x: intent.x, y: intent.y } }
    case 'context':
      return { contextMenu: { id: intent.id, kind: intent.kind, clientX: intent.clientX, clientY: intent.clientY, x: intent.x, y: intent.y } }
    default:
      return {}
  }
}

/** @param {import('../../strata/src/index.js').SystemHandle} system @param {string} id */
function isNode (system, id) {
  return system.nodes().some(n => n.id === id)
}

/** @param {import('../../strata/src/index.js').SystemHandle} system @param {string} id */
function edgeExists (system, id) {
  return system.edges().some(e => e.id === id)
}

/** @param {import('../../strata/src/index.js').SystemHandle} system @param {string} id */
function bpExists (system, id) {
  return system.ports().some(bp => bp.id === id)
}

/** @param {import('../../strata/src/index.js').SystemHandle} system @param {string} id */
function isNodeOrEdge (system, id) {
  return isNode(system, id) || edgeExists(system, id)
}
