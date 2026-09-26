// strata-graph demo: a small standalone diagram editor. The graph only renders and reports
// intents; this file is the host that owns the data, applies intents and keeps undo history.
// In Strata the host is the view adapter in strata-ui (M3), which turns intents into commands.
import { create, createMinimap } from '../packages/graph/src/index.js'

const PORTS = {
  box: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
  cylinder: [{ id: 'in', side: 'left', direction: 'in' }],
  queue: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
  person: [{ id: 'out', side: 'right', direction: 'out' }],
  cloud: [{ id: 'in', side: 'left', direction: 'in' }],
}
const NAMES = {
  box: 'Service',
  cylinder: 'Database',
  queue: 'Queue',
  person: 'Client',
  cloud: 'External API',
}

let data = {
  frames: [{ id: 'f1', x: 260, y: 40, w: 520, h: 330, label: 'Payments', kind: 'trust-boundary' }],
  nodes: [
    {
      id: 'n1',
      x: 40,
      y: 170,
      w: 140,
      h: 90,
      shape: 'person',
      label: 'Web client',
      ports: PORTS.person,
    },
    {
      id: 'n2',
      x: 300,
      y: 90,
      label: 'API gateway',
      sublabel: 'proxy',
      parent: 'f1',
      ports: PORTS.box,
    },
    {
      id: 'n3',
      x: 560,
      y: 90,
      label: 'Payment service',
      sublabel: 'service',
      parent: 'f1',
      ports: [...PORTS.box, { id: 'db', side: 'bottom', direction: 'out' }],
    },
    {
      id: 'n4',
      x: 560,
      y: 250,
      w: 160,
      h: 80,
      shape: 'cylinder',
      label: 'Ledger DB',
      parent: 'f1',
      ports: [{ id: 'in', side: 'top', direction: 'in' }],
    },
    {
      id: 'n5',
      x: 300,
      y: 250,
      shape: 'queue',
      label: 'Settlement queue',
      parent: 'f1',
      ports: PORTS.queue,
    },
    {
      id: 'n6',
      x: 900,
      y: 240,
      w: 160,
      h: 90,
      shape: 'cloud',
      label: 'Bank API',
      ports: PORTS.cloud,
    },
  ],
  edges: [
    {
      id: 'e1',
      source: { node: 'n1', port: 'out' },
      target: { node: 'n2', port: 'in' },
      label: 'HTTPS',
    },
    { id: 'e2', source: { node: 'n2', port: 'out' }, target: { node: 'n3', port: 'in' } },
    { id: 'e3', source: { node: 'n3', port: 'db' }, target: { node: 'n4', port: 'in' } },
    {
      id: 'e4',
      source: { node: 'n3', port: 'out' },
      target: { node: 'n5', port: 'in' },
      style: { dash: '6 4' },
      label: 'async',
    },
    {
      id: 'e5',
      source: { node: 'n5', port: 'out' },
      target: { node: 'n6', port: 'in' },
      style: { dash: '6 4' },
    },
  ],
  annotations: [
    {
      id: 'a1',
      kind: 'sticky',
      x: 40,
      y: 330,
      text: 'Card data stays inside the Payments boundary.',
    },
  ],
}

const undo = []
const redo = []
let next = 100
const id = prefix => `${prefix}${++next}`
const graph = create(document.getElementById('canvas'), { grid: 10 })
const minimap = createMinimap(graph, document.getElementById('minimap'), {
  width: 220,
  height: 150,
})
const $ = sel => document.querySelector(sel)

/** Records the current data for undo, applies a change, re-renders. */
function change(fn) {
  undo.push(JSON.stringify(data))
  redo.length = 0
  fn()
  refresh()
}

function refresh() {
  graph.setData(data)
  $('#undo').disabled = !undo.length
  $('#redo').disabled = !redo.length
  status()
}

function status() {
  const s = graph.stats
  $('#status').textContent =
    `${s.nodes} nodes · ${s.edges} edges · ${graph.selection.length} selected · zoom ${Math.round(graph.transform.k * 100)}%${s.culled ? ' · culled' : ''}`
}

const find = itemId =>
  [...data.nodes, ...data.frames, ...data.annotations].find(item => item.id === itemId)

function addNode(shape, x, y) {
  if (shape === 'sticky') {
    const note = { id: id('a'), kind: 'sticky', x: x - 80, y: y - 60, text: 'New note' }
    change(() => data.annotations.push(note))
    return note.id
  }
  const node = {
    id: id('n'),
    x: Math.round((x - 80) / 10) * 10,
    y: Math.round((y - 32) / 10) * 10,
    shape,
    label: NAMES[shape],
    ports: PORTS[shape],
  }
  change(() => data.nodes.push(node))
  return node.id
}

graph.on('intent', intent => {
  switch (intent.type) {
    case 'select':
      graph.select(intent.ids)
      status()
      break
    case 'move':
      change(() => {
        for (const item of intent.items) {
          const target = find(item.id)
          target.x = item.x
          target.y = item.y
          if (item.kind !== 'frame') target.parent = item.parent ?? undefined
        }
      })
      break
    case 'resize':
      change(() =>
        Object.assign(find(intent.id), { x: intent.x, y: intent.y, w: intent.w, h: intent.h })
      )
      break
    case 'connect':
      change(() => data.edges.push({ id: id('e'), source: intent.source, target: intent.target }))
      break
    case 'connect-to-point': {
      const nodeId = addNode('box', intent.x + 80, intent.y)
      change(() =>
        data.edges.push({
          id: id('e'),
          source: intent.source,
          target: { node: nodeId, port: 'in' },
        })
      )
      undo.pop() // node and edge undo as one step
      break
    }
    case 'reconnect':
      change(() => {
        data.edges.find(e => e.id === intent.edge)[intent.end] = intent.to
      })
      break
    case 'waypoints':
      change(() => {
        data.edges.find(e => e.id === intent.edge).waypoints = intent.waypoints
      })
      break
    case 'delete': {
      const gone = new Set(intent.ids)
      change(() => {
        data.nodes = data.nodes.filter(n => !gone.has(n.id))
        data.frames = data.frames.filter(f => !gone.has(f.id))
        data.annotations = data.annotations.filter(a => !gone.has(a.id))
        data.edges = data.edges.filter(
          e => !gone.has(e.id) && !gone.has(e.source.node) && !gone.has(e.target.node)
        )
      })
      graph.select([])
      break
    }
    case 'open': {
      const item =
        intent.kind === 'edge' ? data.edges.find(e => e.id === intent.id) : find(intent.id)
      const field = intent.kind === 'annotation' ? 'text' : 'label'
      const value = window.prompt('Rename', item?.[field] ?? '')
      if (item && value !== null)
        change(() => {
          item[field] = value
        })
      break
    }
    case 'drop':
      addNode(intent.data?.shape ?? 'box', intent.x, intent.y)
      break
  }
})
graph.on('transform', status)

for (const button of document.querySelectorAll('.palette')) {
  button.addEventListener('dragstart', event => {
    event.dataTransfer.setData(
      'application/x-strata',
      JSON.stringify({ shape: button.dataset.shape })
    )
    event.dataTransfer.effectAllowed = 'copy'
  })
  button.addEventListener('click', () => {
    const c = graph.size
    const world = graph.clientToWorld({
      x: graph.element.getBoundingClientRect().left + c.width / 2,
      y: graph.element.getBoundingClientRect().top + c.height / 2,
    })
    addNode(button.dataset.shape, world.x, world.y)
  })
}

const step = (from, to) => {
  if (!from.length) return
  to.push(JSON.stringify(data))
  data = JSON.parse(/** @type {string} */ (from.pop()))
  refresh()
}
$('#undo').addEventListener('click', () => step(undo, redo))
$('#redo').addEventListener('click', () => step(redo, undo))
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) step(redo, undo)
  else step(undo, redo)
})
$('#routing').addEventListener('change', event => graph.setOptions({ routing: event.target.value }))
$('#readonly').addEventListener('change', event =>
  graph.setOptions({ readOnly: event.target.checked })
)
$('#theme').addEventListener('click', event => {
  const dark = event.target.textContent === 'Dark'
  graph.setTheme(dark ? 'dark' : 'light')
  event.target.textContent = dark ? 'Light' : 'Dark'
  minimap.refresh()
})
$('#align-left').addEventListener('click', () => graph.align('left'))
$('#align-top').addEventListener('click', () => graph.align('top'))
$('#distribute').addEventListener('click', () => graph.distribute('horizontal'))
$('#fit').addEventListener('click', () => graph.fit({ animate: true }))
$('#zoom-sel').addEventListener('click', () => graph.zoomTo(graph.selection))
let heat = false
$('#heat').addEventListener('click', () => {
  heat = !heat
  if (heat)
    graph.setOverlay('heatmap', {
      values: Object.fromEntries(data.nodes.map((n, i) => [n.id, (i * 37) % 100])),
      domain: [0, 100],
    })
  else graph.clearOverlay('heatmap')
})
const download = (blob, name) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
$('#svg').addEventListener('click', () =>
  download(new Blob([graph.exportSVG()], { type: 'image/svg+xml' }), 'diagram.svg')
)
$('#png').addEventListener('click', async () =>
  download(await graph.exportPNG({ scale: 2 }), 'diagram.png')
)

refresh()
graph.fit()
Object.assign(window, { graph, getData: () => data })
