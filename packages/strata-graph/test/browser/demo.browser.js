// Smoke test for examples/graph-demo.html, so the demo keeps working as the library changes.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from '../../../../scripts/dev-server.js'
import { findPlaywright } from '../../../../scripts/playwright.js'

let server
let browser
let page
const errors = []

before(async () => {
  server = await startServer()
  const { chromium } = await findPlaywright()
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.goto(`${server.url}/examples/graph-demo.html`)
  await page.waitForFunction(() => window.graph && document.querySelectorAll('.sg-node').length > 0, null, { timeout: 10000 })
})

after(async () => {
  await browser?.close()
  await server?.close()
})

test('the demo loads under the strict CSP and renders the sample diagram', async () => {
  assert.equal(await page.evaluate(() => document.querySelectorAll('#canvas .sg-node').length), 6)
  assert.equal(await page.evaluate(() => document.querySelectorAll('#minimap rect').length > 6), true)
  assert.deepEqual(errors, [])
})

test('adding, connecting to empty space and undo work end to end', async () => {
  const count = () => page.evaluate(() => window.getData().nodes.length)
  await page.click('button[data-shape="queue"]')
  assert.equal(await count(), 7)
  await page.click('#undo')
  assert.equal(await count(), 6)
  await page.click('#redo')
  assert.equal(await count(), 7)
  await page.click('#undo')

  const port = await page.evaluate(() => {
    const el = document.querySelector('.sg-node[data-id="n6"]')
    const node = window.getData().nodes.find(n => n.id === 'n5')
    const a = window.graph.worldToClient({ x: node.x + 160, y: node.y + 32 })
    return { a, has: !!el }
  })
  await page.mouse.move(port.a.x, port.a.y)
  await page.mouse.down()
  await page.mouse.move(port.a.x + 60, port.a.y + 200, { steps: 6 })
  await page.mouse.up()
  const after = await page.evaluate(() => ({ nodes: window.getData().nodes.length, edges: window.getData().edges.length }))
  assert.deepEqual(after, { nodes: 7, edges: 6 })
  await page.click('#undo')
  assert.deepEqual(await page.evaluate(() => ({ nodes: window.getData().nodes.length, edges: window.getData().edges.length })), { nodes: 6, edges: 5 }, 'node and edge undo together')
})

test('theme, routing and export controls', async () => {
  await page.click('#theme')
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.sg-background')).fill), 'rgb(28, 25, 23)')
  await page.selectOption('#routing', 'curved')
  assert.match(await page.evaluate(() => document.querySelector('.sg-edge-path').getAttribute('d')), / C/)
  const svg = await page.evaluate(() => window.graph.exportSVG())
  assert.ok(svg.includes('Payment service'))
  assert.deepEqual(errors, [])
})
