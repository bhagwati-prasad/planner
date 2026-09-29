// @ts-check
// Overlays and export in strata-graph (task 0208): the simulation and debug overlays of design
// system §6, and standalone SVG export.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/** @typedef {import('@playwright/test').Page} Page */

/** @param {string} id @param {number} x @param {number} y */
const card = (id, x, y) => ({
  id,
  x,
  y,
  w: 184,
  h: 56,
  label: { a: 'Web client', b: 'Orders service', c: 'Payments', d: 'Ledger' }[id] ?? id,
  ports: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
})
/** @param {string} id @param {string} from @param {string} to */
const edge = (id, from, to) => ({
  id,
  source: { node: from, port: 'out' },
  target: { node: to, port: 'in' },
})

/** a → b → c → d in a row, with b → d below. */
const ROW = {
  nodes: [card('a', 24, 40), card('b', 264, 40), card('c', 504, 40), card('d', 504, 150)],
  edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('bd', 'b', 'd')],
  frames: [],
  annotations: [],
}

/** @param {Page} page @param {object} [data] @param {string} [theme] */
async function open(page, data = ROW, theme = 'light') {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(
    ({ data, theme }) => {
      const w = /** @type {any} */ (window)
      w.makeGraph({ theme }, data, false)
      w.g.setTransform({ x: 0, y: 0, k: 1 })
    },
    { data, theme }
  )
}

test.describe('strata-graph overlays and export', () => {
  test('requesting 1,000 dots draws at most 400', async ({ page }) => {
    await open(page)
    const drawn = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      const edges = ['ab', 'bc', 'bd']
      const dots = Array.from({ length: 1000 }, (_, i) => ({
        edge: edges[i % 3],
        t: (i % 97) / 97,
        failed: i % 50 === 0,
      }))
      w.g.setOverlay('requests', { dots })
      return document.querySelectorAll('#host .sg-request').length
    })
    expect(drawn).toBe(400)
  })

  test('the scope overlay dims out-of-scope components to 30% opacity', async ({ page }) => {
    await open(page)
    const scoped = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      w.g.setOverlay('scope', { ids: ['a', 'b'] })
      const opacity = (/** @type {string} */ id) =>
        getComputedStyle(
          /** @type {Element} */ (document.querySelector(`#host .sg-node[data-id="${id}"]`))
        ).opacity
      return {
        a: opacity('a'),
        b: opacity('b'),
        c: opacity('c'),
        d: opacity('d'),
        outlines: document.querySelectorAll('#host .sg-scope-outline').length,
      }
    })
    expect(scoped).toEqual({ a: '1', b: '1', c: '0.3', d: '0.3', outlines: 2 })
  })

  test('exportSVG() output has no external references and re-renders identically', async ({
    page,
  }) => {
    await open(page)
    const result = await page.evaluate(
      async data => {
        const w = /** @type {any} */ (window)
        const icon =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>'
        data.nodes[0].icon = icon
        w.makeGraph({}, data, false)
        w.g.setOverlay('scope', { ids: ['a', 'b'] })
        const first = w.g.exportSVG()
        // A second graph, drawn from the same data, exports the same document.
        w.makeGraph({}, data, false)
        w.g.setOverlay('scope', { ids: ['a', 'b'] })
        const second = w.g.exportSVG()
        const doc = new DOMParser().parseFromString(first, 'image/svg+xml')
        const external = []
        for (const el of doc.querySelectorAll('*')) {
          if (/^(script|foreignObject|image|link)$/i.test(el.localName)) external.push(el.localName)
          for (const attr of el.attributes) {
            const refs = [...attr.value.matchAll(/url\(\s*['"]?([^'")]*)/g)].map(m => m[1])
            if (/^(xlink:)?href$/.test(attr.name)) refs.push(attr.value)
            for (const ref of refs) if (!ref.startsWith('#')) external.push(`${attr.name}=${ref}`)
          }
        }
        if (/@import|url\(\s*['"]?(?!#)/.test(doc.querySelector('style')?.textContent ?? ''))
          external.push('style')
        // The file draws as an image on its own.
        const url = URL.createObjectURL(new Blob([first], { type: 'image/svg+xml' }))
        const img = new Image()
        const drawn = await new Promise(resolve => {
          img.onload = () => resolve(img.naturalWidth > 0)
          img.onerror = () => resolve(false)
          img.src = url
        })
        URL.revokeObjectURL(url)
        return { external, identical: first === second, drawn }
      },
      JSON.parse(JSON.stringify(ROW))
    )
    expect(result).toEqual({ external: [], identical: true, drawn: true })
  })

  test(
    'every simulation and debugging overlay matches its visual snapshot in light and dark themes',
    { tag: '@visual' },
    async ({ page }) => {
      const three = {
        nodes: [card('a', 24, 40), card('b', 288, 40), card('c', 552, 40)],
        edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')],
        frames: [],
        annotations: [],
      }
      /** @type {Record<string, { data: object, overlays: Record<string, object> }>} */
      const scenes = {
        simulation: {
          data: three,
          overlays: {
            heatmap: { values: { a: 0.3, b: 0.72, c: 0.97 }, domain: [0, 1] },
            requests: {
              dots: [
                { edge: 'ab', t: 0.2 },
                { edge: 'ab', t: 0.5, failed: true },
                { edge: 'ab', t: 0.8 },
              ],
            },
            followed: { edge: 'bc', t: 0.6, trail: ['ab'] },
          },
        },
        debugging: {
          data: {
            nodes: [card('a', 24, 40), card('b', 288, 40), card('c', 552, 40), card('d', 552, 150)],
            edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('bd', 'b', 'd')],
            frames: [],
            annotations: [],
          },
          overlays: {
            scope: { ids: ['b', 'c'], stubs: { bd: 'recorded' }, sources: { ab: 'Checkout' } },
            breakpoints: { values: { b: {}, c: { conditional: true } } },
            hop: { node: 'b', edge: 'bc' },
          },
        },
      }
      for (const theme of ['light', 'dark'])
        for (const [name, scene] of Object.entries(scenes)) {
          await open(page, scene.data, theme)
          await page.evaluate(overlays => {
            const w = /** @type {any} */ (window)
            for (const [kind, spec] of Object.entries(overlays)) w.g.setOverlay(kind, spec)
          }, scene.overlays)
          const host = await page.locator('#host').boundingBox()
          if (!host) throw new Error('no #host')
          await expect
            .soft(page, `${name} in ${theme} theme`)
            .toHaveScreenshot(`${name}-${theme}.png`, {
              clip: { x: host.x, y: host.y, width: 800, height: 240 },
            })
        }
    }
  )
})
