// Test harness: exposes the library and a minimal in-memory host that applies intents the
// way Strata's view adapter will (M3), so tests exercise the full intent → setData loop.
import * as strataGraph from '../../src/index.js'

const w = /** @type {any} */ (window)
w.strataGraph = strataGraph

w.sample = () => ({
  frames: [
    { id: 'zone', x: 300, y: 60, w: 460, h: 300, label: 'Payments zone', kind: 'trust-boundary' },
  ],
  nodes: [
    {
      id: 'client',
      x: 40,
      y: 160,
      w: 140,
      h: 60,
      shape: 'person',
      label: 'Web client',
      ports: [{ id: 'out', side: 'right', direction: 'out' }],
    },
    {
      id: 'svc',
      x: 340,
      y: 120,
      w: 160,
      h: 64,
      shape: 'box',
      label: 'Payment service',
      sublabel: 'service@1.0.0',
      parent: 'zone',
      ports: [
        { id: 'in', side: 'left', direction: 'in' },
        { id: 'out', side: 'right', direction: 'out' },
        { id: 'db', side: 'bottom', direction: 'out' },
      ],
    },
    {
      id: 'db',
      x: 340,
      y: 260,
      w: 160,
      h: 70,
      shape: 'cylinder',
      label: 'Ledger DB',
      parent: 'zone',
      ports: [{ id: 'in', side: 'top', direction: 'in' }],
    },
    {
      id: 'bank',
      x: 900,
      y: 120,
      w: 140,
      h: 64,
      shape: 'cloud',
      label: 'Bank API',
      ports: [{ id: 'in', side: 'left', direction: 'in' }],
    },
  ],
  edges: [
    {
      id: 'e1',
      source: { node: 'client', port: 'out' },
      target: { node: 'svc', port: 'in' },
      label: 'HTTPS',
    },
    { id: 'e2', source: { node: 'svc', port: 'db' }, target: { node: 'db', port: 'in' } },
  ],
  annotations: [
    { id: 'note', kind: 'sticky', x: 40, y: 320, text: 'Card data never leaves the zone' },
  ],
})

/** Applies intents to `w.data` and pushes the result back into the graph. */
function apply(intent) {
  const g = w.g
  const data = w.data
  const find = id =>
    [...data.nodes, ...data.frames, ...data.annotations].find(item => item.id === id)
  switch (intent.type) {
    case 'select':
      g.select(intent.ids)
      return
    case 'move':
      for (const item of intent.items) {
        const target = find(item.id)
        if (!target) continue
        target.x = item.x
        target.y = item.y
        if (item.kind !== 'frame' || item.parent) target.parent = item.parent ?? undefined
      }
      break
    case 'resize':
      Object.assign(find(intent.id), { x: intent.x, y: intent.y, w: intent.w, h: intent.h })
      break
    case 'connect':
      data.edges.push({
        id: `e${data.edges.length + 1}-${Date.now()}`,
        source: intent.source,
        target: intent.target,
      })
      break
    case 'waypoints':
      data.edges.find(e => e.id === intent.edge).waypoints = intent.waypoints
      break
    case 'reconnect':
      data.edges.find(e => e.id === intent.edge)[intent.end] = intent.to
      break
    case 'delete': {
      const gone = new Set(intent.ids)
      data.nodes = data.nodes.filter(n => !gone.has(n.id))
      data.frames = data.frames.filter(f => !gone.has(f.id))
      data.annotations = data.annotations.filter(a => !gone.has(a.id))
      data.edges = data.edges.filter(
        e =>
          !gone.has(e.id) &&
          !gone.has(e.source.node ?? e.source) &&
          !gone.has(e.target.node ?? e.target)
      )
      break
    }
    default:
      return
  }
  g.setData(data)
}

/**
 * Creates a fresh graph in #host.
 * @param {object} [options] graph options
 * @param {object} [data] graph data (default: sample())
 * @param {boolean} [autoApply] apply intents with the in-memory host
 */
w.makeGraph = (options = {}, data = w.sample(), autoApply = true) => {
  w.g?.destroy()
  w.intents = []
  w.events = { transform: 0, hover: [] }
  w.data = data
  const g = strataGraph.create(document.getElementById('host'), options)
  w.g = g
  g.on('intent', intent => {
    w.intents.push(intent)
    if (autoApply) apply(intent)
  })
  g.on('transform', () => {
    w.events.transform++
  })
  g.on('hover', h => {
    w.events.hover.push(h)
  })
  g.setData(data)
  return g.problems
}

/** Client coordinates of an item's centre. */
w.centerOf = id => {
  const r = w.g.bounds([id])
  return w.g.worldToClient({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
}

/** Client coordinates of a node's port. */
w.portOf = (nodeId, portId) => {
  const node = w.data.nodes.find(n => n.id === nodeId)
  const a = strataGraph.portAnchors(node, node.ports).get(portId)
  return w.g.worldToClient(a)
}

/** Client coordinates of a world point. */
w.clientOf = (x, y) => w.g.worldToClient({ x, y })

w.harnessReady = true
