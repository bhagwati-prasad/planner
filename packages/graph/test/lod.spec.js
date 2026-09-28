// @ts-check
// Level of detail and performance in strata-graph (task 0207): what each zoom band of design
// system §6 draws, updates keyed by rev, and the Canvas 2D node layer above 1,500 elements.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/** @typedef {import('@playwright/test').Page} Page */

/** @param {Page} page @param {object} data @param {Record<string, unknown>} [options] */
async function open(page, data, options = {}) {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(
    ({ data, options }) => {
      const w = /** @type {any} */ (window)
      w.makeGraph(options, { frames: [], edges: [], annotations: [], ...data }, false)
      w.g.setTransform({ x: 0, y: 0, k: 1 })
    },
    { data, options }
  )
}

/** A card with every part the zoom bands decide about. */
const SERVICE = {
  id: 'svc',
  x: 40,
  y: 60,
  label: 'Orders service',
  sublabel: 'Service, 3 instances',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>',
  badges: ['2'],
  ports: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
}
/** A component with an inner system, whose name the lowest band draws large. */
const SYSTEM = {
  id: 'pay',
  x: 400,
  y: 60,
  label: 'Payments system',
  composite: true,
  ports: [{ id: 'in', side: 'left', direction: 'in' }],
}
const EDGE = {
  id: 'e',
  label: 'checkout',
  source: { node: 'svc', port: 'out' },
  target: { node: 'pay', port: 'in' },
}

test.describe('strata-graph level of detail and performance', () => {
  test('at each zoom band the drawn parts match the ds §6 table', async ({ page }) => {
    await open(page, { nodes: [SERVICE, SYSTEM], edges: [EDGE] })
    // Selected, so its ports show whenever the band allows them.
    await page.evaluate(() => /** @type {any} */ (window).g.select(['svc']))
    /** @param {number} k */
    const partsAt = k =>
      page.evaluate(k => {
        const w = /** @type {any} */ (window)
        w.g.setTransform({ x: 0, y: 0, k })
        const shown = (/** @type {string} */ sel) => {
          const el = document.querySelector(`#host ${sel}`)
          if (!el) return false
          const r = el.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) return false
          for (let e = /** @type {Element|null} */ (el); e; e = e.parentElement) {
            const s = getComputedStyle(e)
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
          }
          return true
        }
        const name = document.querySelector('#host .sg-lod-name')
        return {
          block: shown('.sg-node[data-id="svc"] .sg-shape'),
          title: shown('.sg-node[data-id="svc"] .sg-title'),
          icon: shown('.sg-node[data-id="svc"] .sg-icon-tile'),
          subtitle: shown('.sg-node[data-id="svc"] .sg-subtitle'),
          badges: shown('.sg-node[data-id="svc"] .sg-card-badge'),
          ports: shown('.sg-node[data-id="svc"] .sg-port-dot'),
          edgeLabel: shown('.sg-edge[data-id="e"] .sg-edge-label-group'),
          systemName: shown('.sg-lod-name')
            ? {
                text: name?.textContent,
                px: Math.round(
                  parseFloat(getComputedStyle(/** @type {Element} */ (name)).fontSize) * k
                ),
              }
            : null,
        }
      }, k)
    const everything = {
      block: true,
      title: true,
      icon: true,
      subtitle: true,
      badges: true,
      ports: true,
      edgeLabel: true,
      systemName: null,
    }
    expect(await partsAt(1), '75% and above: everything').toEqual(everything)
    expect(await partsAt(0.75), '75% is still everything').toEqual(everything)
    expect(await partsAt(0.5), '40–75%: subtitles and ports hidden, badges kept').toEqual({
      ...everything,
      subtitle: false,
      ports: false,
    })
    expect(await partsAt(0.25), '15–40%: icon and title only, connection labels hidden').toEqual({
      ...everything,
      subtitle: false,
      ports: false,
      badges: false,
      edgeLabel: false,
    })
    expect(await partsAt(0.1), 'below 15%: blocks only, system names large').toEqual({
      block: true,
      title: false,
      icon: false,
      subtitle: false,
      badges: false,
      ports: false,
      edgeLabel: false,
      systemName: { text: 'Payments system', px: 16 },
    })
  })

  test('a component whose rev is unchanged is not redrawn, and a new rev redraws only it', async ({
    page,
  }) => {
    await open(page, {
      nodes: [
        { ...SERVICE, rev: 1 },
        { ...SYSTEM, rev: 1 },
      ],
    })
    const changed = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      const touched = new Set()
      const observer = new MutationObserver(records => {
        for (const r of records) {
          const node = /** @type {Element} */ (
            r.target.nodeType === 1 ? r.target : r.target.parentNode
          )
          touched.add(node?.closest?.('.sg-node')?.getAttribute('data-id') ?? 'other')
        }
      })
      observer.observe(/** @type {Node} */ (document.querySelector('#host svg')), {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      })
      const svc = w.data.nodes.find((/** @type {any} */ n) => n.id === 'svc')
      // The host changed the label but not the rev: nothing is redrawn.
      svc.label = 'Order service'
      w.g.setData(w.data)
      const sameRev = [...observer.takeRecords()].length
      // A new rev redraws that component and nothing else.
      svc.rev = 2
      w.g.setData(w.data)
      for (const r of observer.takeRecords()) {
        const node = /** @type {Element} */ (
          r.target.nodeType === 1 ? r.target : r.target.parentNode
        )
        touched.add(node?.closest?.('.sg-node')?.getAttribute('data-id') ?? 'other')
      }
      observer.disconnect()
      return {
        sameRev,
        touched: [...touched].sort(),
        title: document.querySelector('#host .sg-node[data-id="svc"] .sg-title')?.textContent,
      }
    })
    expect(changed).toEqual({ sameRev: 0, touched: ['svc'], title: 'Order service' })
  })

  test('with 2,000 components the canvas layer is used and hit-testing is still exact', async ({
    page,
  }) => {
    // 50 × 40 small components, 16 × 10 each on a 20 × 14 grid: all 2,000 visible at 100%.
    const nodes = []
    for (let row = 0; row < 40; row++)
      for (let col = 0; col < 50; col++)
        nodes.push({
          id: `n${row}-${col}`,
          x: col * 20,
          y: row * 14,
          w: 16,
          h: 10,
          shape: 'box',
          label: '',
        })
    await open(page, { nodes }, { grid: 0 })
    const layer = await page.evaluate(() => ({
      canvas: !!document.querySelector('#host canvas.sg-node-canvas'),
      svgNodes: document.querySelectorAll('#host .sg-node').length,
    }))
    expect(layer).toEqual({ canvas: true, svgNodes: 0 })
    // Component n3-7 covers x 140–156 and y 42–52: a pixel inside each corner hits it, and the
    // 4 px gaps around it hit nothing. Browsers report whole pixels, so every point is one.
    const hits = []
    for (const [x, y] of [
      [141, 43],
      [155, 51],
      [138, 46],
      [158, 46],
      [148, 40],
      [148, 54],
    ]) {
      const at = await page.evaluate(([x, y]) => /** @type {any} */ (window).clientOf(x, y), [x, y])
      await page.mouse.click(at.x, at.y)
      const last = await page.evaluate(() => {
        const selects = /** @type {any} */ (window).intents.filter(
          (/** @type {any} */ i) => i.type === 'select'
        )
        return selects.at(-1)?.ids ?? []
      })
      hits.push(last.join(','))
      // Start each click from nothing selected.
      await page.evaluate(() => {
        const w = /** @type {any} */ (window)
        w.g.select([])
        w.intents.length = 0
      })
    }
    expect(hits).toEqual(['n3-7', 'n3-7', '', '', '', ''])

    // Dragging one drops it with a single move intent, as on the SVG layer.
    const from = await page.evaluate(() => /** @type {any} */ (window).clientOf(148, 47))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y, { steps: 8 })
    await page.mouse.up()
    const moves = await page.evaluate(() =>
      /** @type {any} */ (window).intents.filter((/** @type {any} */ i) => i.type === 'move')
    )
    expect(moves.length).toBe(1)
    expect(moves[0].items).toEqual([expect.objectContaining({ id: 'n3-7', x: 180, y: 42 })])
  })
})
