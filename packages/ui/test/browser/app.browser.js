// Browser tests for the Strata shell (app/index.html): real Chromium, real input.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from '../../../../scripts/dev-server.js'
import { findPlaywright } from '../../../../scripts/playwright.js'

let server
let browser
/** @type {any} */
let page
const errors = []

before(async () => {
  server = await startServer()
  const { chromium } = await findPlaywright()
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  await server?.close()
})

beforeEach(async () => {
  errors.length = 0
  await page?.close()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  page = await context.newPage()
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto(`${server.url}/app/`)
  await page.waitForFunction(() => window.strataApp?.shell?.canvas?.graph)
  await settle()
})

const settle = () =>
  page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
const js = (fn, arg) => page.evaluate(fn, arg)
const graphNodes = () =>
  js(() =>
    window.strataApp.shell.canvas.graph
      .rects()
      .filter(r => r.kind === 'node')
      .map(r => r.id)
  )
const nodeId = name => js(n => window.strata.project.nodes().find(x => x.name === n)?.id, name)
const centerOf = async id =>
  js(i => {
    const g = window.strataApp.shell.canvas.graph
    const r = g.bounds([i])
    return g.worldToClient({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
  }, id)
const breadcrumb = () => page.locator('strata-canvas nav li').allTextContents()
/** Rendered text of a shell element (its shadow content; the host's own innerText is empty). */
const textOf = selector => page.locator(`${selector} .content`).first().innerText()

test('the workspace loads with every region and the sample project', async () => {
  for (const tag of [
    'strata-toolbar',
    'strata-library',
    'strata-tree',
    'strata-canvas',
    'strata-inspector',
    'strata-problems',
  ]) {
    assert.equal(await page.locator(tag).count(), 1, tag)
  }
  assert.equal((await graphNodes()).length, 5)
  assert.deepEqual(await breadcrumb(), ['Checkout'])
  assert.match(await textOf('strata-toolbar'), /Checkout/)
  assert.match(await textOf('strata-inspector'), /Checkout\s+System · context · root/)
  assert.match(
    await textOf('strata-inspector'),
    /Availability\s+9\d(\.\d+)?%/,
    'a percentage roll-up shows in points'
  )
  assert.ok(!(await textOf('strata-inspector')).includes('null'))
  assert.deepEqual(errors, [])
})

test('clicking a library item adds it; the inspector renames it and edits its properties', async () => {
  await page.locator('strata-library button', { hasText: 'Relational DB' }).first().click()
  await settle()
  assert.equal((await graphNodes()).length, 6)
  const inspector = page.locator('strata-inspector')
  assert.match(await textOf('strata-inspector'), /Relational DB · starter\.relational-db@1\.0\.0/)
  const name = inspector.locator('input[data-field="name"]')
  await name.fill('Reporting DB')
  await name.press('Enter')
  await settle()
  assert.ok(await nodeId('Reporting DB'))
  const labels = await js(() =>
    [...window.strataApp.shell.canvas.graph.element.querySelectorAll('.sg-label')]
      .map(t => t.textContent)
      .join(' ')
  )
  assert.match(labels, /Reporting DB/)

  const replicas = inspector.locator('input[data-field="prop:readReplicas"]')
  await replicas.fill('2')
  await replicas.press('Enter')
  await settle()
  assert.equal(await js(() => window.strata.project.node('Reporting DB').props.readReplicas), 2)
  assert.match(await textOf('strata-inspector'), /readReplicas[\s\S]*override/)

  const storage = inspector.locator('input[data-field="prop:storageUsed"]')
  assert.equal(await storage.inputValue(), '50 GB', 'sizes show as written, stored in bytes')
  assert.equal(
    await inspector.locator('input[data-field="prop:availabilityTarget"]').inputValue(),
    '99.9',
    'percentages show in points, stored as fractions'
  )
  await storage.fill('lots')
  await storage.press('Enter')
  await settle()
  assert.match(await inspector.locator('[role="alert"]').innerText(), /Invalid size/)
  assert.equal(
    await js(() => window.strata.project.node('Reporting DB').props.storageUsed),
    50_000_000_000,
    'the invalid value is refused; the default is stored in bytes'
  )
})

test('double-clicking a composite drills down; Backspace goes back up', async () => {
  const orders = await nodeId('Orders')
  const at = await centerOf(orders)
  await page.mouse.dblclick(at.x, at.y)
  await page.waitForFunction(() => window.strata.nav.depth === 1)
  await settle()
  assert.deepEqual(await breadcrumb(), ['Checkout', 'Orders'])
  const inside = await js(() => {
    const g = window.strataApp.shell.canvas.graph
    const ids = g.rects().map(r => r.id)
    return {
      frame: ids.some(id => id.startsWith('frame:')),
      bp: ids.some(id => id.startsWith('bp:')),
      ghost: ids.some(id => id.startsWith('ghost:')),
      nodes: ids.length,
    }
  })
  assert.deepEqual(
    [inside.frame, inside.bp, inside.ghost],
    [true, true, true],
    'frame, boundary port and a context ghost'
  )
  await page.locator('strata-canvas .sg-root').focus()
  await page.keyboard.press('Backspace')
  await page.waitForFunction(() => window.strata.nav.depth === 0)
  await settle()
  assert.deepEqual(await breadcrumb(), ['Checkout'])
  assert.equal((await graphNodes()).length, 5)
})

test('the command palette runs actions; undo and redo from the keyboard', async () => {
  const gw = await nodeId('Edge gateway')
  const web = await nodeId('Web shop')
  await js(ids => window.strataApp.shell.select(ids), [gw, web])
  await page.keyboard.press('Control+k')
  const input = page.locator('strata-palette input')
  await input.fill('extract')
  await input.press('Enter')
  await settle()
  assert.equal(
    await js(() => window.strata.project.root.nodes().length),
    4,
    'two nodes became one composite'
  )
  assert.equal(
    await page.locator('strata-palette').getAttribute('open'),
    null,
    'the palette closed'
  )
  await page.locator('strata-canvas .sg-root').focus()
  await page.keyboard.press('Control+z')
  await settle()
  assert.equal(await js(() => window.strata.project.root.nodes().length), 5)
  await page.keyboard.press('Control+Shift+z')
  await settle()
  assert.equal(await js(() => window.strata.project.root.nodes().length), 4)
})

test('the context menu offers actions for what was clicked', async () => {
  const gw = await nodeId('Edge gateway')
  const at = await centerOf(gw)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const menu = page.locator('strata-context-menu [role="menu"]')
  await menu.waitFor()
  const items = await menu.locator('[role="menuitem"]').allTextContents()
  assert.ok(items.some(t => t.startsWith('Duplicate')))
  assert.ok(items.some(t => t.startsWith('Extract selection as system')))
  await menu.locator('[role="menuitem"]', { hasText: 'Duplicate' }).click()
  await settle()
  assert.ok(await nodeId('Edge gateway copy'))
  assert.equal(await page.locator('strata-context-menu').getAttribute('open'), null)
})

test('find a node anywhere: it navigates into a read-only reference and selects it', async () => {
  await page.keyboard.press('Control+f')
  const input = page.locator('strata-palette input')
  await input.fill('Users DB')
  await input.press('Enter')
  await page.waitForFunction(() => window.strata.nav.depth === 1)
  await page.waitForFunction(() => window.strataApp.shell.selection.length === 1)
  assert.deepEqual(await breadcrumb(), ['Checkout', 'Authread-only'])
  const selected = await js(() => window.strataApp.shell.selection[0])
  assert.equal(selected, await nodeId('Users DB'))
  assert.equal(await js(() => window.strataApp.shell.canvas.graph.options.readOnly), true)
})

test('drag a component from the library onto the canvas', async () => {
  const before = (await graphNodes()).length
  const target = page.locator('strata-canvas .sg-background')
  await page
    .locator('strata-library button', { hasText: 'Message queue' })
    .first()
    .dragTo(target, { targetPosition: { x: 400, y: 450 } })
  await settle()
  assert.equal((await graphNodes()).length, before + 1)
  assert.ok(await nodeId('Message queue'))
})

test('connect two nodes by dragging between ports', async () => {
  await page.locator('strata-library button', { hasText: 'Service' }).first().click()
  await settle()
  const svc = await js(() => window.strata.project.nodes().find(n => n.name === 'Service').id)
  const gw = await nodeId('Edge gateway')
  const ports = await js(
    ([a, b]) => {
      const g = window.strataApp.shell.canvas.graph
      const p = window.strata.project
      const port = (nodeId, name) => {
        const el = g.element.querySelector(
          `.sg-node[data-id="${nodeId}"] .sg-port[data-port="${p.node(nodeId).port(name).id}"]`
        )
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
      return { from: port(a, 'out'), to: port(b, 'in') }
    },
    [gw, svc]
  )
  await page.mouse.move(ports.from.x, ports.from.y)
  await page.mouse.down()
  await page.mouse.move(ports.to.x, ports.to.y, { steps: 8 })
  await page.mouse.up()
  await settle()
  const edges = await js(id => window.strata.project.node(id).port('in').edges().length, svc)
  assert.equal(edges, 1)
})

test('theme toggle, the console dock and problems', async () => {
  await page.locator('strata-toolbar button', { hasText: 'Dark' }).click()
  assert.equal(await js(() => document.documentElement.dataset.theme), 'dark')
  assert.equal(
    await js(
      () =>
        getComputedStyle(
          window.strataApp.shell.canvas.graph.element.querySelector('.sg-background')
        ).fill
    ),
    'rgb(19, 22, 26)'
  )

  await page.locator('strata-app [role="tab"]', { hasText: 'Console' }).click()
  const input = page.locator('strata-oplog input')
  await input.fill('{"type": "project.update", "payload": {"changes": {"name": "Shop"}}}')
  await input.press('Enter')
  await settle()
  assert.match(await textOf('strata-toolbar'), /Shop/)
  assert.match(await page.locator('strata-oplog ol').innerText(), /project\.update/)

  await input.fill(
    '{"type": "component.add", "payload": {"systemId": "' +
      (await js(() => window.strata.project.root.id)) +
      '", "typeRef": "acme.gone@1.0.0", "name": "Legacy", "ports": []}}'
  )
  await input.press('Enter')
  await settle()
  const tab = page.locator('strata-app [role="tab"]', { hasText: 'Problems' })
  assert.match(await tab.innerText(), /Problems \(1\)/)
  await tab.click()
  await page.locator('strata-problems button', { hasText: 'not installed' }).click()
  await page.waitForFunction(() => window.strataApp.shell.selection.length === 1)
  assert.equal(await js(() => window.strataApp.shell.selection[0]), await nodeId('Legacy'))
  await settle()
  assert.match(await textOf('strata-inspector'), /not installed \(placeholder\)/)
})

test('the project tree navigates', async () => {
  await page.locator('strata-tree button', { hasText: 'Orders' }).click()
  await page.waitForFunction(() => window.strata.nav.depth === 1)
  assert.deepEqual(await breadcrumb(), ['Checkout', 'Orders'])
  await page.locator('strata-canvas nav button', { hasText: 'Checkout' }).click()
  await page.waitForFunction(() => window.strata.nav.depth === 0)
})

test('any region element can be swapped through the shell config', async () => {
  const result = await js(() => {
    customElements.define(
      'my-inspector',
      class extends HTMLElement {
        set strata(v) {
          this._strata = v
          this.render()
        }
        set shell(v) {
          this._shell = v
          this.render()
        }
        render() {
          if (this._strata && this._shell)
            this.textContent = `Custom inspector for ${this._strata.project.name}`
        }
      }
    )
    const app = document.createElement('strata-app')
    app.config = { ...app.config, regions: { ...app.config.regions, right: ['my-inspector'] } }
    app.strata = window.strata
    window.strataApp.remove()
    document.body.append(app)
    return app.shadowRoot.querySelector('my-inspector')?.textContent
  })
  assert.equal(result, 'Custom inspector for Checkout')
  assert.equal(await page.locator('strata-inspector').count(), 0)
  assert.deepEqual(errors, [])
})

test('keyboard shortcuts overlay lists the shortcuts', async () => {
  await page.locator('strata-toolbar button[aria-label="Keyboard shortcuts"]').click()
  const help = page.locator('strata-app [aria-label="Keyboard shortcuts"][role="dialog"]')
  await help.waitFor()
  const text = await help.innerText()
  for (const expected of ['Undo', 'Command palette', 'Extract selection as system', 'Space + drag'])
    assert.ok(text.includes(expected), expected)
})

test('edges show their connection type’s properties, and the type offers what both ports accept', async () => {
  const edge = await js(() => {
    const p = window.strata.project
    return p.root.edges().find(e => e.from.node.name === 'Web shop').id
  })
  await js(id => window.strataApp.shell.select([id]), edge)
  await settle()
  const text = await textOf('strata-inspector')
  assert.match(text, /Connection · HTTP \/ REST/)
  assert.match(text, /Reliability[\s\S]*timeout[\s\S]*retries/i)
  const options = await page
    .locator('strata-inspector select[data-field="connectionType"] option')
    .allTextContents()
  assert.deepEqual(options, ['—', 'grpc', 'http', 'websocket'])
  const retries = page.locator('strata-inspector input[data-field="prop:retries"]')
  await retries.fill('3')
  await retries.press('Enter')
  await settle()
  assert.equal(await js(id => window.strata.project.edge(id).props.retries, edge), 3)
  await page.locator('strata-inspector select[data-field="connectionType"]').selectOption('grpc')
  await settle()
  assert.match(await textOf('strata-inspector'), /Connection · gRPC[\s\S]*streaming/i)
})

test('served mode: editing a component folder updates the open app', async () => {
  const { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { STARTER_DIRS } = await import('../../../../scripts/dev-server.js')
  const dir = mkdtempSync(join(tmpdir(), 'strata-live-'))
  cpSync(STARTER_DIRS[0], join(dir, 'components'), { recursive: true })
  const live = await startServer({
    components: [join(dir, 'components'), STARTER_DIRS[1]],
    watch: true,
  })
  try {
    await page.goto(`${live.url}/app/`)
    await page.waitForFunction(() => window.strataApp?.shell?.canvas?.graph)
    await page.waitForFunction(
      () => window.strata.components.get('starter.cache')?.name === 'Cache'
    )
    const manifestPath = join(dir, 'components', 'cache', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, name: 'Redis cache' }, null, 2))
    await page.waitForFunction(
      () => window.strata.components.get('starter.cache')?.name === 'Redis cache',
      null,
      { timeout: 5000 }
    )
    await settle()
    assert.equal(await page.locator('strata-library button', { hasText: 'Redis cache' }).count(), 1)
    await page.locator('strata-app .toast', { hasText: 'starter.cache@1.0.0 changed' }).waitFor()
  } finally {
    await live.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('upload: a packed .strata.js, a zipped folder, a broken folder and a drop', async () => {
  const { packComponent } = await import('../../../plugins/src/index.js')
  const { messageQueueFolder, makeZip } = await import('../../../plugins/test/fixtures.js')
  const picker = page.locator('strata-library input[type="file"]')
  const { script } = packComponent(messageQueueFolder(), { name: 'message-queue' })

  await picker.setInputFiles({
    name: 'message-queue.strata.js',
    mimeType: 'text/javascript',
    buffer: Buffer.from(script ?? ''),
  })
  await page
    .locator('strata-app .toast', { hasText: 'Added Message Queue (acme.message-queue@1.2.0)' })
    .waitFor()
  assert.equal(
    await js(
      () => window.strata.components.list().find(c => c.id === 'acme.message-queue')?.source
    ),
    'bundle'
  )

  const manifest = JSON.parse(messageQueueFolder()['manifest.json'])
  const v2 = {
    ...messageQueueFolder(),
    'manifest.json': JSON.stringify({ ...manifest, version: '1.3.0' }),
  }
  const zipped = makeZip(
    Object.fromEntries(Object.entries(v2).map(([p, c]) => [`message-queue/${p}`, c]))
  )
  await picker.setInputFiles({
    name: 'message-queue.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipped),
  })
  await page.waitForFunction(
    () => window.strata.components.versions('acme.message-queue').length === 2
  )
  const report = page.locator('strata-library .report[role="status"]')
  assert.match(await report.innerText(), /1 warning[\s\S]*lib\/unused\.js: Not imported/)
  await report.locator('button[aria-label="Dismiss"]').click()
  assert.equal(await report.count(), 0)

  const broken = makeZip({
    'broken/manifest.json': '{ "id": "acme.broken", "name": "Broken", "version": "1.0.0" }',
  })
  await picker.setInputFiles({
    name: 'broken.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(broken),
  })
  const alert = page.locator('strata-library .report[role="alert"]')
  await alert.waitFor()
  assert.match(await alert.innerText(), /not added[\s\S]*manifest\.json: strataApi is required/)

  // Dropping a file on the panel goes through the same path.
  const dropped = packComponent({
    ...messageQueueFolder(),
    'manifest.json': JSON.stringify({
      ...manifest,
      id: 'acme.dropped-queue',
      name: 'Dropped queue',
    }),
  }).script
  await page.evaluate(text => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'dropped.strata.js', { type: 'text/javascript' }))
    const target = document.querySelector('strata-app').shadowRoot.querySelector('strata-library')
    target.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true })
    )
    target.dispatchEvent(
      new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })
    )
  }, dropped)
  await page.locator('strata-app .toast', { hasText: 'Added Dropped queue' }).waitFor()
  assert.equal(await page.locator('strata-library button', { hasText: 'Dropped queue' }).count(), 1)
})
