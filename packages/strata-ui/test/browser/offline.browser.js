// The offline build (spec §4 "Build", §17 "The file:// caveat"): dist/strata.html opened from
// disk, with components added by script tags, as an offline user would.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from '../../../../scripts/build.js'
import { main as strataCli } from '../../../strata-cli/src/cli.js'
import { findPlaywright } from '../../../../scripts/playwright.js'

let dir
let browser

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'strata-offline-'))
  await build({ out: join(dir, 'dist'), log: () => {} })
  const { chromium } = await findPlaywright()
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function open () {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.goto(pathToFileURL(join(dir, 'dist', 'strata.html')).href)
  await page.waitForFunction(() => window.strataApp?.shell?.canvas?.graph)
  return { page, errors }
}

test('strata.html runs from file:// with the starter library from its script tags', async () => {
  const { page, errors } = await open()
  const state = await page.evaluate(() => ({
    protocol: location.protocol,
    bundles: window.strata.components.list({ kind: 'component' }).filter(c => c.source === 'bundle').length,
    connectionTypes: window.strata.components.connectionTypes().length,
    nodes: window.strata.project.root.nodes().length,
    global: Object.keys(window.Strata).sort()
  }))
  assert.deepEqual(state, { protocol: 'file:', bundles: 19, connectionTypes: 6, nodes: 5, global: ['createStrata', 'mountStrata', 'registerComponent', 'version'] })
  assert.equal(await page.locator('strata-library button', { hasText: 'Relational DB' }).count(), 1)
  // Drill down and back, as a smoke test of the whole UI in the bundled build.
  await page.evaluate(() => window.strata.nav.enter(window.strata.project.node('Orders')))
  await page.waitForFunction(() => window.strata.nav.depth === 1)
  assert.deepEqual(errors, [])
  await page.close()
})

test('a user component packed with strata pack --install loads in the offline app', async () => {
  const io = { cwd: dir, stdout: { write () {} }, stderr: { write: t => process.stderr.write(t) } }
  assert.equal(await strataCli(['new', 'component', 'order-router', '--extends', 'base:proxy', '--id', 'acme.order-router'], io), 0)
  assert.equal(await strataCli(['pack', 'components/order-router', '--install', 'dist/strata.html'], io), 0)
  assert.match(readFileSync(join(dir, 'dist', 'strata.html'), 'utf8'), /<script src="\.\.\/components\/order-router\/order-router\.strata\.js"><\/script>\n<!-- STRATA:COMPONENTS:END -->/)

  const { page, errors } = await open()
  const added = await page.evaluate(() => {
    const p = window.strata.project
    const node = p.root.add('acme.order-router', { name: 'Router' })
    return { type: node.type, source: window.strata.components.list().find(c => c.id === 'acme.order-router')?.source, modules: Object.keys(window.strata.components.bundle('acme.order-router').modules) }
  })
  assert.deepEqual(added, { type: 'acme.order-router@0.1.0', source: 'bundle', modules: ['index.js'] })

  // After start-up, registerComponent installs straight away.
  const late = await page.evaluate(() => {
    const b = structuredClone(window.strata.components.bundle('acme.order-router'))
    window.Strata.registerComponent(b)
    return window.strata.components.versions('acme.order-router')
  })
  assert.deepEqual(late, ['0.1.0'])
  assert.deepEqual(errors, [])
  await page.close()
})
