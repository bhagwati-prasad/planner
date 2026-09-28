// @ts-check
// Snapping, smart guides, align and distribute in strata-graph (task 0205): design system §6
// snaps within 6 screen pixels and labels guides with distances at 11 px.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/**
 * @typedef {import('@playwright/test').Page} Page
 * @typedef {{ x: number, y: number }} Point
 */

/** @param {string} id @param {number} x @param {number} y */
const card = (id, x, y) => ({ id, x, y, w: 184, h: 56, label: id, ports: [] })

/**
 * Opens the harness on the given components at a zoom, without grid snapping so that only
 * guides snap.
 * @param {Page} page @param {object[]} nodes @param {number} k
 */
async function open(page, nodes, k) {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(
    ({ nodes, k }) => {
      const w = /** @type {any} */ (window)
      w.makeGraph({ grid: 0 }, { nodes, edges: [], frames: [], annotations: [] }, false)
      w.g.setTransform({ x: 0, y: 0, k })
    },
    { nodes, k }
  )
}

/** The guides and their distance labels on screen. @param {Page} page */
const guides = page =>
  page.evaluate(() => {
    const k = /** @type {any} */ (window).g.transform.k
    return {
      lines: [...document.querySelectorAll('#host line.sg-guide')].map(l => ({
        x1: Number(l.getAttribute('x1')),
        x2: Number(l.getAttribute('x2')),
      })),
      labels: [...document.querySelectorAll('#host .sg-guide-label')].map(t => ({
        text: t.textContent,
        px: parseFloat(getComputedStyle(t).fontSize) * k,
      })),
    }
  })

test.describe('strata-graph snapping and guides', () => {
  test('dragging within 6 screen px of alignment snaps and shows a guide', async ({ page }) => {
    // At 200% zoom, 6 screen pixels are 3 world units.
    await open(page, [card('a', 40, 40), card('b', 300, 200)], 2)
    const c = await page.evaluate(() => /** @type {any} */ (window).centerOf('b'))
    // b's left edge is 300; 40 lines it up with a.
    const to = (/** @type {number} */ screenPx) => ({ x: c.x - (300 - 40) * 2 + screenPx, y: c.y })
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.move(to(5).x, to(5).y, { steps: 10 })
    expect(await guides(page), '5 px away: a guide at x = 40, labelled with the gap').toEqual({
      lines: [{ x1: 40, x2: 40 }],
      labels: [{ text: '104', px: 11 }],
    })
    await page.mouse.move(to(7).x, to(7).y, { steps: 2 })
    expect(await guides(page), '7 px away: no guide').toEqual({ lines: [], labels: [] })
    await page.mouse.move(to(5).x, to(5).y, { steps: 2 })
    await page.mouse.up()
    const moves = await page.evaluate(() =>
      /** @type {any} */ (window).intents.filter((/** @type {any} */ i) => i.type === 'move')
    )
    expect(moves.length).toBe(1)
    expect(moves[0].items[0]).toMatchObject({ id: 'b', x: 40, y: 200 })
  })

  test('align-left on three components emits one intent with three positions', async ({ page }) => {
    await open(page, [card('a', 40, 40), card('b', 120, 140), card('c', 260, 240)], 1)
    const moves = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      w.g.select(['a', 'b', 'c'])
      w.g.align('left')
      return w.intents.filter((/** @type {any} */ i) => i.type === 'move')
    })
    expect(moves.length).toBe(1)
    const items = moves[0].items.map((/** @type {any} */ i) => ({ id: i.id, x: i.x, y: i.y }))
    expect(
      items.sort((/** @type {any} */ p, /** @type {any} */ q) => (p.id < q.id ? -1 : 1))
    ).toEqual([
      { id: 'a', x: 40, y: 40 },
      { id: 'b', x: 40, y: 140 },
      { id: 'c', x: 40, y: 240 },
    ])
  })
})
