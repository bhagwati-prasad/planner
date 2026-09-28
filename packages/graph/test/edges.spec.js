// @ts-check
// Edges of strata-graph (task 0203): the connection kinds of design system §6, parallel edges,
// and edges bound to a method.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/** @param {string} id @param {number} x @param {number} y */
const box = (id, x, y) => ({
  id,
  x,
  y,
  w: 184,
  h: 56,
  label: id === 'a' ? 'Orders service' : 'Ledger',
  ports: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
})

/** @param {string} id @param {Record<string, unknown>} [extra] */
const edge = (id, extra = {}) => ({
  id,
  source: { node: 'a', port: 'out' },
  target: { node: 'b', port: 'in' },
  ...extra,
})

/**
 * Opens the harness with nodes a and b side by side and the given edges.
 * @param {import('@playwright/test').Page} page
 * @param {object[]} edges
 * @param {string} [theme]
 */
async function draw(page, edges, theme = 'light') {
  await page.evaluate(
    ({ edges, theme, nodes }) => {
      const w = /** @type {any} */ (window)
      w.makeGraph({ theme }, { nodes, edges, frames: [], annotations: [] }, false)
      w.g.setTransform({ x: 0, y: 0, k: 1 })
    },
    { edges, theme, nodes: [box('a', 40, 52), box('b', 376, 52)] }
  )
}

test.describe('strata-graph edges', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS)
    await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  })

  test('each connection kind matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
    const host = await page.locator('#host').boundingBox()
    if (!host) throw new Error('no #host')
    const kinds = {
      sync: {},
      stream: { kind: 'stream' },
      'stream-bidirectional': { kind: 'stream', bidirectional: true },
      async: { kind: 'async' },
      database: { kind: 'db' },
      batch: { kind: 'batch' },
      selected: { kind: 'async', select: true },
    }
    for (const theme of ['light', 'dark'])
      for (const [name, { select, ...kind }] of Object.entries(kinds)) {
        await draw(page, [edge('e', { label: 'checkout', ...kind })], theme)
        if (select) await page.evaluate(() => /** @type {any} */ (window).g.select(['e']))
        await expect
          .soft(page, `${name} in ${theme} theme`)
          .toHaveScreenshot(`${name}-${theme}.png`, {
            clip: { x: host.x, y: host.y, width: 600, height: 160 },
          })
      }
  })

  test('parallel edges between the same pair are offset so both are visible', async ({ page }) => {
    await draw(page, [
      edge('e1'),
      edge('e2'),
      edge('e3', { source: { node: 'b', port: 'in' }, target: { node: 'a', port: 'out' } }),
    ])
    const middles = await page.evaluate(() =>
      ['e1', 'e2', 'e3'].map(id => {
        const path = /** @type {SVGPathElement} */ (
          document.querySelector(`#host .sg-edge[data-id="${id}"] .sg-edge-path`)
        )
        const p = path.getPointAtLength(path.getTotalLength() / 2)
        return { x: p.x, y: p.y }
      })
    )
    for (let i = 0; i < middles.length; i++)
      for (let j = i + 1; j < middles.length; j++) {
        const gap = Math.hypot(middles[i].x - middles[j].x, middles[i].y - middles[j].y)
        expect(gap, `edges ${i + 1} and ${j + 1} are apart`).toBeGreaterThanOrEqual(6)
      }
  })

  test('an edge bound to a method shows the method name in its label', async ({ page }) => {
    await draw(page, [
      edge('e', { method: 'publish' }),
      edge('f', { label: 'orders', method: 'insert' }),
    ])
    const labels = await page.evaluate(() =>
      ['e', 'f'].map(id => {
        const group = /** @type {Element} */ (
          document.querySelector(`#host .sg-edge[data-id="${id}"]`)
        )
        const method = group.querySelector('.sg-method')
        return {
          text: group.querySelector('.sg-edge-label')?.textContent,
          method: method?.textContent,
          font: method ? getComputedStyle(method).fontFamily : null,
        }
      })
    )
    expect(labels[0].text).toBe('publish')
    expect(labels[0].method).toBe('publish')
    expect(labels[0].font).toContain('IBM Plex Mono')
    expect(labels[1].text).toContain('orders')
    expect(labels[1].method).toBe('insert')
  })
})
