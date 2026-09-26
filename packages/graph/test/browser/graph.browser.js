// Browser tests for the strata-graph renderer: real Chromium, real pointer and keyboard input.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from '../../../../scripts/dev-server.js'
import { findPlaywright } from '../../../../scripts/playwright.js'

let server
let browser
/** @type {any} */
let page
const pageErrors = []

before(async () => {
  server = await startServer()
  const { chromium } = await findPlaywright()
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  page.on('pageerror', err => pageErrors.push(err.message))
  await page.goto(`${server.url}/packages/graph/test/browser/harness.html`)
  await page.waitForFunction(() => window.harnessReady, null, { timeout: 10000 })
})

after(async () => {
  await browser?.close()
  await server?.close()
})

beforeEach(() => { pageErrors.length = 0 })

const js = (fn, arg) => page.evaluate(fn, arg)
const intents = type => js(t => window.intents.filter(i => !t || i.type === t), type)
const lastIntent = async type => (await intents(type)).at(-1)

async function drag (from, to, { steps = 8, modifiers = [] } = {}) {
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
}

test('renders nodes, ports, edges, frames and annotations', async () => {
  const problems = await js(() => makeGraph())
  assert.deepEqual(problems, [])
  const dom = await js(() => ({
    nodes: [...document.querySelectorAll('.sg-node')].map(n => n.getAttribute('data-id')),
    ports: document.querySelectorAll('.sg-port').length,
    edges: document.querySelectorAll('.sg-edge').length,
    frames: [...document.querySelectorAll('.sg-frame')].map(f => f.getAttribute('class')),
    notes: document.querySelectorAll('.sg-annotation').length,
    labels: [...document.querySelectorAll('.sg-label')].map(t => t.textContent),
    sublabel: document.querySelector('.sg-sublabel')?.textContent,
    edgeLabel: document.querySelector('.sg-edge-label')?.textContent,
    aria: document.querySelector('.sg-node[data-id="svc"]').getAttribute('aria-label'),
    stats: g.stats
  }))
  assert.deepEqual(dom.nodes, ['client', 'svc', 'db', 'bank'])
  assert.equal(dom.ports, 6)
  assert.equal(dom.edges, 2)
  assert.deepEqual(dom.frames, ['sg-frame sg-kind-trust-boundary'])
  assert.equal(dom.notes, 1)
  assert.deepEqual(dom.labels, ['Web client', 'Payment service', 'Ledger DB', 'Bank API'])
  assert.equal(dom.sublabel, 'service@1.0.0')
  assert.equal(dom.edgeLabel, 'HTTPS')
  assert.equal(dom.aria, 'Payment service, service@1.0.0')
  assert.equal(dom.stats.culled, false)
  assert.deepEqual(pageErrors, [])
})

test('edges start and end at their ports; orthogonal routes are axis-aligned', async () => {
  await js(() => makeGraph())
  const d = await js(() => document.querySelector('.sg-edge[data-id="e2"] .sg-edge-path').getAttribute('d'))
  assert.equal(d, 'M420,184 L420,260', 'svc.db (bottom centre) straight down to db.in (top centre)')
  const d1 = await js(() => document.querySelector('.sg-edge[data-id="e1"] .sg-edge-path').getAttribute('d'))
  assert.match(d1, /^M180,190 /, 'leaves the client port')
  assert.match(d1, /L340,152$/, 'arrives at the service input')
})

test('clicking selects; shift-click adds; clicking the background clears', async () => {
  await js(() => makeGraph())
  const svc = await js(() => centerOf('svc'))
  const db = await js(() => centerOf('db'))
  await page.mouse.click(svc.x, svc.y)
  assert.deepEqual((await lastIntent('select')).ids, ['svc'])
  assert.equal(await js(() => document.querySelector('.sg-node[data-id="svc"]').classList.contains('sg-selected')), true)
  await page.keyboard.down('Shift')
  await page.mouse.click(db.x, db.y)
  await page.keyboard.up('Shift')
  assert.deepEqual((await lastIntent('select')).ids, ['svc', 'db'])
  await page.mouse.click(950, 650)
  assert.deepEqual((await lastIntent('select')).ids, [])
  assert.deepEqual(await js(() => g.selection), [])
})

test('dragging a node snaps to the grid, follows the pointer, and reports its new frame', async () => {
  await js(() => makeGraph())
  const from = await js(() => centerOf('client'))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 300, from.y - 20, { steps: 10 })
  const during = await js(() => document.querySelector('.sg-node[data-id="client"]').getAttribute('transform'))
  assert.notEqual(during, 'translate(40,160)', 'moves while dragging')
  assert.equal((await intents('move')).length, 0, 'nothing is committed until release')
  await page.mouse.move(from.x + 403, from.y - 17, { steps: 4 })
  await page.mouse.up()
  const move = await lastIntent('move')
  assert.equal(move.items.length, 1)
  const [item] = move.items
  assert.equal(item.id, 'client')
  assert.equal(item.x % 10, 0)
  assert.equal(item.y % 10, 0)
  assert.equal(item.parent, 'zone', 'dropped inside the trust boundary')
  assert.deepEqual((await lastIntent('select')).ids, ['client'], 'dragging an unselected node selects it')
})

test('smart guides line a dragged node up with its neighbours', async () => {
  await js(() => makeGraph({ grid: 0 }))
  const from = await js(() => centerOf('bank'))
  // Bank's top edge is at y=120 like the service; drag it 3px off and let the guide pull it back.
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 100, from.y + 3, { steps: 6 })
  const guides = await js(() => document.querySelectorAll('.sg-guide').length)
  await page.mouse.up()
  assert.ok(guides > 0, 'guides are drawn while dragging')
  const [item] = (await lastIntent('move')).items
  assert.equal(item.y, 120)
})

test('dragging a frame brings its contents; a selection moves together', async () => {
  await js(() => makeGraph())
  const title = await js(() => clientOf(400, 70))
  await drag(title, { x: title.x + 50, y: title.y + 30 })
  const move = await lastIntent('move')
  assert.deepEqual(move.items.map(i => i.id).sort(), ['db', 'svc', 'zone'])
  const byId = Object.fromEntries(move.items.map(i => [i.id, i]))
  assert.equal(byId.svc.x - 340, byId.zone.x - 300, 'contents move by the same offset')
  assert.equal(byId.svc.parent, 'zone')

  await js(() => { window.intents = []; g.select(['client', 'bank']) })
  const client = await js(() => centerOf('client'))
  await drag(client, { x: client.x, y: client.y + 200 })
  assert.deepEqual((await lastIntent('move')).items.map(i => i.id).sort(), ['bank', 'client'])
})

test('connecting: port to port, reverse direction, to empty space, and invalid targets', async () => {
  await js(() => makeGraph())
  await drag(await js(() => portOf('svc', 'out')), await js(() => portOf('bank', 'in')))
  let c = await lastIntent('connect')
  assert.deepEqual(c, { type: 'connect', source: { node: 'svc', port: 'out' }, target: { node: 'bank', port: 'in' } })
  assert.equal(await js(() => document.querySelectorAll('.sg-edge').length), 3, 'the host applied it')

  await js(() => { window.intents = [] })
  await drag(await js(() => portOf('bank', 'in')), await js(() => portOf('client', 'out')))
  c = await lastIntent('connect')
  assert.deepEqual([c.source, c.target], [{ node: 'client', port: 'out' }, { node: 'bank', port: 'in' }], 'dragging from an input connects backwards')

  await js(() => { window.intents = [] })
  const bankCentre = await js(() => centerOf('bank'))
  await drag(await js(() => portOf('client', 'out')), bankCentre)
  c = await lastIntent('connect')
  assert.deepEqual(c.target, { node: 'bank', port: 'in' }, 'dropping on a node picks its suitable port')

  await js(() => { window.intents = [] })
  await drag(await js(() => portOf('client', 'out')), await js(() => clientOf(700, 600)))
  const toPoint = await lastIntent('connect-to-point')
  assert.deepEqual(toPoint.source, { node: 'client', port: 'out' })
  assert.equal(Math.round(toPoint.x), 700)

  await js(() => { window.intents = [] })
  await drag(await js(() => portOf('svc', 'out')), await js(() => portOf('client', 'out')))
  assert.equal((await intents('connect')).length, 0, 'a node with no suitable port refuses the connection')
})

test('a host rule decides which connections are allowed', async () => {
  await js(() => makeGraph({ canConnect: (s, t) => t.node !== 'bank' }))
  await drag(await js(() => portOf('svc', 'out')), await js(() => portOf('bank', 'in')))
  assert.equal((await intents('connect')).length, 0)
})

test('selection rectangle picks touched nodes and enclosed frames', async () => {
  await js(() => makeGraph())
  await drag(await js(() => clientOf(250, 40)), await js(() => clientOf(800, 400)))
  const ids = (await lastIntent('select')).ids
  assert.deepEqual(ids.slice().sort(), ['db', 'e2', 'svc', 'zone'].sort())
})

test('keyboard: delete, arrows, enter, escape, select all', async () => {
  await js(() => makeGraph())
  const svc = await js(() => centerOf('svc'))
  await page.mouse.click(svc.x, svc.y)
  await page.keyboard.press('ArrowRight')
  let move = await lastIntent('move')
  assert.deepEqual(move.items.map(i => [i.id, i.x, i.y]), [['svc', 350, 120]])
  await page.keyboard.press('Shift+ArrowDown')
  move = await lastIntent('move')
  assert.deepEqual(move.items.map(i => [i.id, i.x, i.y]), [['svc', 350, 220]])
  await page.keyboard.press('Enter')
  assert.deepEqual(await lastIntent('open'), { type: 'open', id: 'svc', kind: 'node' })
  await page.keyboard.press('Delete')
  assert.deepEqual((await lastIntent('delete')).ids, ['svc'])
  assert.equal(await js(() => document.querySelectorAll('.sg-edge').length), 0, 'its edges went with it')
  await page.keyboard.press('Control+a')
  assert.deepEqual((await lastIntent('select')).ids.sort(), ['bank', 'client', 'db', 'note', 'zone'])
  await page.keyboard.press('Escape')
  assert.deepEqual((await lastIntent('select')).ids, [])
})

test('Tab reaches nodes; Space selects the focused node', async () => {
  await js(() => makeGraph())
  await js(() => g.focus('db'))
  await page.keyboard.press('Space')
  assert.deepEqual((await lastIntent('select')).ids, ['db'])
  await page.keyboard.press('Tab')
  const focused = await js(() => document.activeElement.getAttribute('data-id'))
  assert.equal(focused, 'bank')
})

test('zoom and pan: ctrl+wheel zooms at the pointer, wheel scrolls, fit and zoomTo', async () => {
  await js(() => makeGraph())
  const before = await js(() => g.transform)
  const at = await js(() => centerOf('svc'))
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -300)
  await page.keyboard.up('Control')
  await page.waitForTimeout(50)
  const zoomed = await js(() => g.transform)
  assert.ok(zoomed.k > before.k, 'zoomed in')
  const after = await js(() => centerOf('svc'))
  assert.ok(Math.abs(after.x - at.x) < 2 && Math.abs(after.y - at.y) < 2, 'the point under the pointer stays put')
  await page.mouse.wheel(0, 100)
  await page.waitForTimeout(50)
  const scrolled = await js(() => g.transform)
  assert.equal(scrolled.k, zoomed.k)
  assert.ok(scrolled.y < zoomed.y, 'scrolled down')
  const fitted = await js(() => { g.fit(); return g.transform })
  const bounds = await js(() => { const b = g.bounds(); const t = g.transform; return { left: b.x * t.k + t.x, right: (b.x + b.w) * t.k + t.x } })
  assert.ok(bounds.left >= 0 && bounds.right <= 1000, 'everything fits')
  assert.ok(fitted.k <= 1)
  const focused = await js(() => { g.zoomTo(['db'], { animate: false }); return g.transform })
  assert.equal(focused.k, 1.5)
  assert.ok((await js(() => window.events.transform)) > 0)
})

test('space+drag pans the view', async () => {
  await js(() => makeGraph())
  await page.mouse.click(950, 650)
  const before = await js(() => g.transform)
  await page.keyboard.down(' ')
  await drag({ x: 950, y: 650 }, { x: 850, y: 600 })
  await page.keyboard.up(' ')
  const after = await js(() => g.transform)
  assert.deepEqual([after.x - before.x, after.y - before.y], [-100, -50])
  assert.equal((await intents('select')).filter(i => i.ids.length).length, 0, 'panning does not select')
})

test('resize handles emit a resize intent snapped to the grid', async () => {
  await js(() => makeGraph())
  const svc = await js(() => centerOf('svc'))
  await page.mouse.click(svc.x, svc.y)
  const handle = await js(() => {
    const r = document.querySelector('.sg-handle-se').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await drag(handle, { x: handle.x + 43, y: handle.y + 16 })
  const resize = await lastIntent('resize')
  assert.deepEqual(resize, { type: 'resize', id: 'svc', kind: 'node', x: 340, y: 120, w: 200, h: 80 })
})

test('edges: click to select, drag the midpoint handle to add a waypoint, double-click to remove it', async () => {
  await js(() => makeGraph())
  const mid = await js(() => {
    const path = document.querySelector('.sg-edge[data-id="e2"] .sg-edge-path')
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    return clientOf(p.x, p.y)
  })
  await page.mouse.click(mid.x, mid.y)
  assert.deepEqual((await lastIntent('select')).ids, ['e2'])
  const handles = await js(() => [...document.querySelectorAll('.sg-edge-handle')].map(h => h.getAttribute('class')))
  assert.equal(handles.filter(c => c.includes('sg-waypoint-new')).length, 1)
  const insert = await js(() => {
    const r = document.querySelector('.sg-waypoint-new').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await drag(insert, { x: insert.x + 80, y: insert.y })
  const wp = await lastIntent('waypoints')
  assert.equal(wp.edge, 'e2')
  assert.deepEqual(wp.waypoints, [{ x: 500, y: 220 }])
  const d = await js(() => document.querySelector('.sg-edge[data-id="e2"] .sg-edge-path').getAttribute('d'))
  assert.match(d, /500/, 'the route now passes the waypoint')
  const handle = await js(() => {
    const r = document.querySelector('.sg-waypoint:not(.sg-waypoint-new)').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.dblclick(handle.x, handle.y)
  assert.deepEqual((await lastIntent('waypoints')).waypoints, [])
})

test('dragging an edge end reconnects it', async () => {
  await js(() => makeGraph())
  await js(() => g.select(['e1']))
  const end = await js(() => {
    const [target] = [...document.querySelectorAll('.sg-edge-handle.sg-handle')].slice(-1)
    const r = target.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await drag(end, await js(() => portOf('bank', 'in')))
  assert.deepEqual(await lastIntent('reconnect'), { type: 'reconnect', edge: 'e1', end: 'target', to: { node: 'bank', port: 'in' } })
})

test('double-click opens; right-click asks for a context menu', async () => {
  await js(() => makeGraph())
  const svc = await js(() => centerOf('svc'))
  await page.mouse.dblclick(svc.x, svc.y)
  assert.deepEqual(await lastIntent('open'), { type: 'open', id: 'svc', kind: 'node' })
  await page.mouse.click(svc.x, svc.y, { button: 'right' })
  const ctx = await lastIntent('context')
  assert.equal(ctx.id, 'svc')
  assert.equal(ctx.kind, 'node')
  await page.mouse.click(950, 650, { button: 'right' })
  assert.equal((await lastIntent('context')).id, null)
})

test('library items dropped on the canvas become a drop intent in world coordinates', async () => {
  await js(() => makeGraph())
  await js(() => {
    const svg = g.element
    const box = svg.getBoundingClientRect()
    const dt = new DataTransfer()
    dt.setData('application/x-strata', JSON.stringify({ type: 'service' }))
    for (const type of ['dragover', 'drop']) {
      svg.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: box.left + 600, clientY: box.top + 500, bubbles: true, cancelable: true }))
    }
  })
  assert.deepEqual(await lastIntent('drop'), { type: 'drop', data: { type: 'service' }, x: 600, y: 500 })
})

test('read-only diagrams select and navigate but never request changes', async () => {
  await js(() => makeGraph({ readOnly: true }))
  const from = await js(() => centerOf('client'))
  await drag(from, { x: from.x + 200, y: from.y })
  await drag(await js(() => portOf('svc', 'out')), await js(() => portOf('bank', 'in')))
  await page.keyboard.press('Delete')
  assert.deepEqual((await intents()).map(i => i.type).filter(t => t !== 'select'), [])
  assert.equal(await js(() => document.querySelectorAll('.sg-handle').length), 0)
})

test('layers hide and lock; ghosts are drawn faded and ignore the pointer', async () => {
  await js(() => {
    const data = sample()
    data.layers = [{ id: 'ops', hidden: true }, { id: 'fixed', locked: true }]
    data.nodes.push({ id: 'hidden', x: 40, y: 500, label: 'Hidden', layer: 'ops' })
    data.nodes.push({ id: 'ghost', x: 600, y: 500, label: 'Parent neighbour', ghost: true })
    data.nodes.find(n => n.id === 'bank').layer = 'fixed'
    return makeGraph({}, data)
  })
  assert.equal(await js(() => !!document.querySelector('.sg-node[data-id="hidden"]')), false)
  const ghost = await js(() => ({ cls: document.querySelector('.sg-node[data-id="ghost"]').getAttribute('class'), tab: document.querySelector('.sg-node[data-id="ghost"]').getAttribute('tabindex') }))
  assert.match(ghost.cls, /sg-ghost/)
  assert.equal(ghost.tab, null)
  const bank = await js(() => centerOf('bank'))
  await drag(bank, { x: bank.x - 200, y: bank.y })
  assert.equal((await intents('move')).length, 0, 'locked layers do not move')
})

test('overlays: heatmap, badges, edge width and highlight', async () => {
  await js(() => makeGraph())
  const result = await js(() => {
    g.setOverlay('heatmap', { values: { svc: 0.9, db: 0.1 }, domain: [0, 1] })
    g.setOverlay('badges', { values: { svc: 3 } })
    g.setOverlay('edge-width', { values: { e1: 100, e2: 10 } })
    g.setOverlay('highlight', { ids: ['svc', 'e1'] })
    const heat = [...document.querySelectorAll('.sg-heat')].map(r => r.closest('.sg-node').getAttribute('data-id'))
    const badge = document.querySelector('.sg-node[data-id="svc"] .sg-badge text')?.textContent
    const width = id => Number(document.querySelector(`.sg-edge[data-id="${id}"] .sg-edge-path`).style.strokeWidth)
    const dimmed = [...document.querySelectorAll('.sg-dimmed')].map(el => el.getAttribute('data-id')).sort()
    g.clearOverlay('highlight')
    return { heat, badge, e1: width('e1'), e2: width('e2'), dimmed, after: document.querySelectorAll('.sg-dimmed').length }
  })
  assert.deepEqual(result.heat.sort(), ['db', 'svc'])
  assert.equal(result.badge, '3')
  assert.equal(result.e1, 8)
  assert.equal(result.e2, 1)
  assert.deepEqual(result.dimmed, ['bank', 'client', 'db', 'e2', 'note', 'zone'])
  assert.equal(result.after, 0)
})

test('export: standalone SVG with resolved styles, and PNG', async () => {
  await js(() => makeGraph())
  const svg = await js(() => g.exportSVG())
  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.ok(!svg.includes('var(--sg-'), 'theme variables are resolved')
  assert.ok(svg.includes('Payment service'))
  const elements = await js(s => {
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml')
    return { hit: doc.querySelectorAll('.sg-edge-hit').length, handles: doc.querySelectorAll('.sg-handle, .sg-edge-handle').length, nodes: doc.querySelectorAll('.sg-node').length }
  }, svg)
  assert.deepEqual(elements, { hit: 0, handles: 0, nodes: 4 }, 'interaction-only elements are left out')
  const only = await js(() => g.exportSVG({ ids: ['svc', 'db', 'e2'] }))
  assert.ok(only.includes('Ledger DB') && !only.includes('Web client'))
  const parsed = await js(s => new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror') === null, svg)
  assert.ok(parsed, 'well-formed XML')
  const png = await js(async () => {
    const blob = await g.exportPNG({ scale: 2 })
    const bitmap = await createImageBitmap(blob)
    return { type: blob.type, size: blob.size, width: bitmap.width }
  })
  assert.equal(png.type, 'image/png')
  assert.ok(png.size > 1000)
  const width = Number(/width="(\d+)"/.exec(svg)[1])
  assert.equal(png.width, width * 2)
})

test('icons from plugins are sanitised', async () => {
  await js(() => {
    const data = sample()
    data.nodes[1].icon = '<svg viewBox="0 0 10 10" onload="window.pwned=1"><script>window.pwned=2</script><a href="javascript:alert(1)"><circle r="4" cx="5" cy="5" fill="url(https://evil.test/x)"/></a><rect width="10" height="10" style="fill:red"/></svg>'
    return makeGraph({}, data)
  })
  const icon = await js(() => document.querySelector('.sg-node[data-id="svc"] .sg-icon')?.outerHTML ?? '')
  assert.ok(icon.includes('<rect'), 'safe shapes are kept')
  for (const bad of ['script', 'onload', 'javascript:', 'evil.test', 'style=', '<a ']) assert.ok(!icon.includes(bad), `${bad} removed`)
  assert.equal(await js(() => window.pwned), undefined)
})

test('custom shapes and themes', async () => {
  await js(() => makeGraph())
  const out = await js(() => {
    g.registerShape('octagon', {
      size: { w: 90, h: 90 },
      render (sel, d) { sel.append('polygon').attr('class', 'sg-shape').attr('points', `0,0 ${d.w},0 ${d.w},${d.h} 0,${d.h}`) }
    })
    const data = sample()
    data.nodes.push({ id: 'oct', x: 600, y: 420, shape: 'octagon', label: 'Custom' })
    g.setData(data)
    const oct = document.querySelector('.sg-node[data-id="oct"] polygon')?.getAttribute('points')
    g.setTheme('dark')
    const bg = getComputedStyle(document.querySelector('.sg-background')).fill
    return { oct, bg, shapes: g.shapes.includes('octagon') }
  })
  assert.equal(out.oct, '0,0 90,0 90,90 0,90', 'default size comes from the shape')
  assert.equal(out.bg, 'rgb(28, 25, 23)')
  assert.ok(out.shapes)
})

test('large diagrams are culled to the view and stay responsive', async () => {
  const result = await js(() => {
    const nodes = []
    const edges = []
    for (let i = 0; i < 2000; i++) {
      nodes.push({ id: `n${i}`, x: (i % 50) * 200, y: Math.floor(i / 50) * 120, label: `Service ${i}`, ports: [{ id: 'in', side: 'left', direction: 'in' }, { id: 'out', side: 'right', direction: 'out' }] })
      if (i % 50) edges.push({ id: `e${i}`, source: { node: `n${i - 1}`, port: 'out' }, target: { node: `n${i}`, port: 'in' } })
    }
    const t0 = performance.now()
    makeGraph({}, { nodes, edges, frames: [], annotations: [] })
    const first = performance.now() - t0
    const stats = g.stats
    const inDom = document.querySelectorAll('.sg-node').length
    return { first, stats, inDom }
  })
  assert.equal(result.stats.culled, true)
  assert.ok(result.inDom < 400, `${result.inDom} nodes in the DOM`)
  assert.ok(result.first < 1500, `first render took ${result.first.toFixed(0)} ms`)
  // Scroll far away: nodes there appear.
  await js(() => g.setTransform({ x: -8000, y: -2000, k: 1 }))
  await page.waitForTimeout(100)
  const far = await js(() => !!document.querySelector('.sg-node[data-id="n1045"]'))
  assert.ok(far, 'nodes near the new view are rendered')
  // Drag a node in the new view: each frame stays fast.
  const target = await js(() => centerOf('n1042'))
  await drag(target, { x: target.x + 100, y: target.y + 50 }, { steps: 10 })
  const move = await lastIntent('move')
  assert.equal(move.items[0].id, 'n1042')
  const renderMs = await js(() => g.stats.ms)
  assert.ok(renderMs < 60, `render took ${renderMs} ms`)
})

test('destroy removes the diagram', async () => {
  await js(() => makeGraph())
  const left = await js(() => { g.destroy(); return document.querySelectorAll('#host svg').length })
  assert.equal(left, 0)
  assert.deepEqual(pageErrors, [])
})
