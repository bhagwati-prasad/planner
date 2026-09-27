// @ts-check
// The scene of strata-graph (task 0201): layers in eng §12 order, idempotent setData, zoomTo
// under reduced motion, and the dot grid of design system §6.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(() => /** @type {any} */ (window).makeGraph())
}

/**
 * The minor and major grid dots at a zoom level: their opacity, and what draws them.
 * @param {import('@playwright/test').Page} page
 * @param {number} k
 */
const gridAt = (page, k) =>
  page.evaluate(scale => {
    const w = /** @type {any} */ (window)
    w.g.setTransform({ x: 0, y: 0, k: scale })
    const layer = document.querySelector('#host .sg-viewport > [data-layer="grid"]')
    /** @param {string} which */
    const dots = which => {
      const el = layer?.querySelector(`.sg-grid-${which}`)
      const style = el ? getComputedStyle(el) : null
      const pattern = el && document.querySelector(el.getAttribute('fill')?.slice(4, -1) ?? '')
      return {
        opacity: style?.visibility === 'hidden' ? 0 : Number(style?.opacity ?? 0),
        shape: pattern?.firstElementChild?.tagName ?? null,
      }
    }
    return { minor: dots('minor'), major: dots('major') }
  }, k)

test.describe('strata-graph scene', () => {
  test('layer groups exist in the order given in eng §12', async ({ page }) => {
    await open(page)
    const layers = await page.evaluate(() =>
      [...document.querySelectorAll('#host .sg-viewport > g')].map(g =>
        g.getAttribute('data-layer')
      )
    )
    expect(layers).toEqual([
      'grid',
      'frames',
      'edges',
      'nodes',
      'overlays',
      'annotations',
      'comment-pins',
      'handles',
    ])
  })

  test('calling setData twice with the same data causes no DOM mutations', async ({ page }) => {
    await open(page)
    const mutations = await page.evaluate(async () => {
      const w = /** @type {any} */ (window)
      w.g.select(['svc'])
      w.g.setData(w.sample())
      const records = []
      const observer = new MutationObserver(list => records.push(...list))
      observer.observe(document.getElementById('host'), {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
      w.g.setData(w.sample())
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      records.push(...observer.takeRecords())
      observer.disconnect()
      return records.map(r =>
        [r.type, /** @type {Element} */ (r.target).getAttribute?.('class'), r.attributeName]
          .filter(Boolean)
          .join(' ')
      )
    })
    expect(mutations).toEqual([])
  })

  test('zoomTo(ids) frames those ids and skips animation under reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page)
    const framed = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      w.g.setTransform({ x: 0, y: 0, k: 0.5 })
      w.g.zoomTo(['db'], { animate: true })
      // Read synchronously: without an animation the view is already where it ends up. The
      // shape is the node's frame; the node's group also holds its ports, which stick out.
      const host = /** @type {Element} */ (document.getElementById('host')).getBoundingClientRect()
      const node = /** @type {Element} */ (
        document.querySelector('#host .sg-node[data-id="db"] .sg-shape')
      ).getBoundingClientRect()
      return {
        k: w.g.transform.k,
        dx: node.x + node.width / 2 - (host.x + host.width / 2),
        dy: node.y + node.height / 2 - (host.y + host.height / 2),
        inside:
          node.left >= host.left &&
          node.right <= host.right &&
          node.top >= host.top &&
          node.bottom <= host.bottom,
      }
    })
    expect(framed.k).toBeGreaterThan(1)
    expect(Math.abs(framed.dx)).toBeLessThan(2)
    expect(Math.abs(framed.dy)).toBeLessThan(2)
    expect(framed.inside).toBe(true)
  })

  test('minor grid dots fade out below 50% zoom', async ({ page }) => {
    await open(page)
    const full = await gridAt(page, 1)
    expect(full.minor.shape).toBe('circle')
    expect(full.major.shape).toBe('circle')
    expect(full.minor.opacity).toBe(1)
    expect((await gridAt(page, 0.5)).minor.opacity).toBe(1)
    const fading = (await gridAt(page, 0.4)).minor.opacity
    expect(fading).toBeGreaterThan(0)
    expect(fading).toBeLessThan(1)
    const far = await gridAt(page, 0.2)
    expect(far.minor.opacity).toBe(0)
    expect(far.major.opacity).toBe(1)
  })
})
