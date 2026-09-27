// @ts-check
// Shapes and ports of strata-graph (task 0202): registered shapes render through keyed joins,
// the default component shape follows design system §6, and ports are easy to hit.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(() => {
    const w = /** @type {any} */ (window)
    w.makeGraph()
    w.g.setTransform({ x: 0, y: 0, k: 1 })
  })
}

test.describe('strata-graph shapes and ports', () => {
  test('a registered shape renders through its render function with keyed joins', async ({
    page,
  }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      /** @type {string[]} */
      const calls = []
      w.g.registerShape('stack', {
        render(/** @type {any} */ sel, /** @type {any} */ d) {
          calls.push(d.id)
          sel
            .selectChildren('rect.sg-shape')
            .data([0, 1, 2], (/** @type {number} */ i) => i)
            .join('rect')
            .attr('class', 'sg-shape')
            .attr('y', (/** @type {number} */ i) => i * 4)
            .attr('width', d.w)
            .attr('height', d.h - 8)
        },
      })
      const data = w.sample()
      const svc = data.nodes.find((/** @type {any} */ n) => n.id === 'svc')
      svc.shape = 'stack'
      w.g.setData(data)
      const rects = () => [
        ...document.querySelectorAll('#host .sg-node[data-id="svc"] .sg-body rect.sg-shape'),
      ]
      const before = rects()
      calls.length = 0
      svc.w = 200
      svc.label = 'Payments'
      w.g.setData(data)
      const after = rects()
      return {
        calls,
        count: after.length,
        kept: before.length === after.length && before.every((el, i) => el === after[i]),
        width: after[0]?.getAttribute('width'),
      }
    })
    expect(result.calls).toEqual(['svc'])
    expect(result.count).toBe(3)
    expect(result.kept).toBe(true)
    expect(result.width).toBe('200')
  })

  test('the default component shape shows its icon tile, title, subtitle and badges', async ({
    page,
  }) => {
    await open(page)
    const card = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      const data = w.sample()
      const svc = data.nodes.find((/** @type {any} */ n) => n.id === 'svc')
      delete svc.shape
      delete svc.w
      delete svc.h
      svc.label = 'Payment authorisation and settlement service'
      svc.badges = ['2', '!', '3', '5', '8']
      svc.icon =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>'
      const bank = data.nodes.find((/** @type {any} */ n) => n.id === 'bank')
      delete bank.shape
      delete bank.w
      delete bank.h
      bank.composite = true
      w.g.setData(data)
      const composite = /** @type {Element} */ (
        document.querySelector('#host .sg-node[data-id="bank"]')
      )
      const outline = composite.querySelector('.sg-shape')?.getBoundingClientRect()
      const node = /** @type {Element} */ (document.querySelector('#host .sg-node[data-id="svc"]'))
      const box = (/** @type {string} */ sel) => {
        const el = node.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }
      return {
        size: box('.sg-shape'),
        tile: box('.sg-icon-tile'),
        icon: box('.sg-icon'),
        title: node.querySelector('.sg-title')?.textContent,
        tooltip: node.querySelector(':scope > title')?.textContent,
        subtitle: node.querySelector('.sg-subtitle')?.textContent,
        badges: [...node.querySelectorAll('.sg-card-badge text')].map(t => t.textContent),
        composite: {
          size: outline && { w: Math.round(outline.width), h: Math.round(outline.height) },
          strata: composite.querySelectorAll('.sg-stratum').length,
          stack: !!composite.querySelector('.sg-icon-tile .sg-stack'),
        },
      }
    })
    expect(card.size).toEqual({ w: 184, h: 56 })
    expect(card.tile).toEqual({ w: 32, h: 32 })
    expect(card.icon).toEqual({ w: 24, h: 24 })
    expect(card.title).toMatch(/^Payment .*…$/)
    expect(card.tooltip).toBe('Payment authorisation and settlement service')
    expect(card.subtitle).toBe('service@1.0.0')
    expect(card.badges).toEqual(['2', '!', '3', '+2'])
    expect(card.composite).toEqual({ size: { w: 208, h: 64 }, strata: 2, stack: true })
  })

  test('port hit areas are 24 px although ports draw at 8 px', async ({ page }) => {
    await open(page)
    const port = await page.evaluate(() => {
      const el = /** @type {Element} */ (
        document.querySelector('#host .sg-node[data-id="svc"] .sg-port[data-port="in"]')
      )
      const dot = /** @type {Element} */ (el.querySelector('.sg-port-dot') ?? el)
      const r = dot.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      // The 'in' port sits on the node's left edge, so left of it is empty canvas.
      const hits = (/** @type {number} */ dx) =>
        document.elementFromPoint(cx + dx, cy)?.closest('.sg-port') === el
      return { drawn: [r.width, r.height], at11: hits(-11), at13: hits(-13) }
    })
    expect(port.drawn).toEqual([8, 8])
    expect(port.at11).toBe(true)
    expect(port.at13).toBe(false)
  })
})
