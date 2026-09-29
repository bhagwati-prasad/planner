// @ts-check
// The Canvas 2D node layer at the SVG layer's level (task 0211): above 1,500 visible components
// the nodes are one Canvas 2D image, and there they keep their shapes, their overlays, ports that
// connect and keyboard focus.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/** @typedef {import('@playwright/test').Page} Page */

/**
 * 2,000 components at 100%: the ones given, along the top, then small boxes 16 × 10 on a 20 × 14
 * grid below them, all inside the area the graph draws.
 * @param {object[]} top
 */
function many(top) {
  const nodes = [...top]
  for (let i = 0; nodes.length < 2000; i++)
    nodes.push({
      id: `n${i}`,
      x: (i % 50) * 20,
      y: 220 + Math.floor(i / 50) * 14,
      w: 16,
      h: 10,
      shape: 'box',
      label: '',
    })
  return { nodes, edges: [], frames: [], annotations: [] }
}

/**
 * @param {Page} page
 * @param {object} data
 * @param {{ node: string, reason: string }} [refuse] canConnect refuses the node with the reason
 */
async function open(page, data, refuse) {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(
    ({ data, refuse }) => {
      const w = /** @type {any} */ (window)
      const canConnect = (/** @type {any} */ _, /** @type {any} */ t) =>
        t.node === refuse?.node ? refuse.reason : true
      w.makeGraph({ grid: 0, ...(refuse ? { canConnect } : {}) }, data, false)
      w.g.setTransform({ x: 0, y: 0, k: 1 })
    },
    { data, refuse }
  )
}

/** Whether the node layer is the canvas, and how many components are SVG. @param {Page} page */
const layer = page =>
  page.evaluate(() => ({
    canvas: !!document.querySelector('#host canvas.sg-node-canvas'),
    svgNodes: document.querySelectorAll('#host .sg-node').length,
  }))

/** @param {Page} page @param {string} type */
const intents = (page, type) =>
  page.evaluate(
    type => /** @type {any} */ (window).intents.filter((/** @type {any} */ i) => i.type === type),
    type
  )

/**
 * The RGBA of the canvas pixel under each world point, and the theme's colours as RGB.
 * @param {Page} page
 * @param {Record<string, [number, number]>} points
 */
const pixels = (page, points) =>
  page.evaluate(points => {
    const w = /** @type {any} */ (window)
    const canvas = /** @type {HTMLCanvasElement} */ (
      document.querySelector('#host canvas.sg-node-canvas')
    )
    const box = canvas.getBoundingClientRect()
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    /** @type {Record<string, number[]>} */
    const out = {}
    for (const [name, [x, y]] of Object.entries(points)) {
      const c = w.g.worldToClient({ x, y })
      const px = Math.floor(((c.x - box.left) * canvas.width) / box.width)
      const py = Math.floor(((c.y - box.top) * canvas.height) / box.height)
      out[name] = [...ctx.getImageData(px, py, 1, 1).data]
    }
    return out
  }, points)

/** The RGB of a theme colour. @param {Page} page @param {string} name */
const colour = (page, name) =>
  page.evaluate(name => {
    const svg = /** @type {Element} */ (document.querySelector('#host svg'))
    const hex = getComputedStyle(svg).getPropertyValue(`--sg-${name}`).trim()
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  }, name)

/** Whether an RGBA pixel is opaque and within a few levels of an RGB colour. */
const near = (/** @type {number[]} */ px, /** @type {number[]} */ rgb) =>
  px[3] === 255 && rgb.every((v, i) => Math.abs(px[i] - v) <= 6)

/** Whether an RGBA pixel is mostly covered by an RGB colour, as a thin line's pixels are. */
const covered = (/** @type {number[]} */ px, /** @type {number[]} */ rgb) =>
  px[3] > 100 && rgb.every((v, i) => Math.abs(px[i] - v) <= 12)

/** Ports on the left for input and on the right for output. */
const PORTS = [
  { id: 'in', side: 'left', direction: 'in' },
  { id: 'out', side: 'right', direction: 'out' },
]

test.describe('strata-graph canvas node layer', () => {
  test('with 2,000 components, dragging from an output port to an input port emits one connect intent, and a refused target shows the invalid state', async ({
    page,
  }) => {
    const data = many([
      { id: 'svc', x: 40, y: 40, w: 120, h: 48, shape: 'box', label: 'Orders', ports: PORTS },
      {
        id: 'db',
        x: 300,
        y: 24,
        w: 140,
        h: 80,
        shape: 'cylinder',
        label: 'Orders DB',
        ports: PORTS,
      },
      { id: 'bank', x: 560, y: 40, w: 120, h: 48, shape: 'box', label: 'Bank', ports: PORTS },
    ])
    await open(page, data, { node: 'bank', reason: 'Bank API takes https only' })
    expect(await layer(page)).toEqual({ canvas: true, svgNodes: 0 })
    /** @param {string} node @param {string} port */
    const port = (node, port) =>
      page.evaluate(([n, p]) => /** @type {any} */ (window).portOf(n, p), [node, port])

    // Over the refused port: its ring, the not-allowed cursor and the reason, and no intent.
    const out = await port('svc', 'out')
    const bank = await port('bank', 'in')
    await page.mouse.move(out.x - 30, out.y)
    await page.mouse.move(out.x, out.y)
    await page.mouse.down()
    await page.mouse.move(bank.x, bank.y, { steps: 12 })
    const invalid = await page.evaluate(() => {
      const ring = document.querySelector('#host .sg-port-invalid .sg-port-ring')
      const box = ring?.getBoundingClientRect()
      return {
        ring: !!ring && getComputedStyle(ring).display !== 'none',
        at: box
          ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
          : null,
        cursor: document.querySelector('#host svg')?.classList.contains('sg-connect-invalid'),
        reason: document.querySelector('#host .sg-refusal text')?.textContent,
      }
    })
    expect(invalid).toEqual({
      ring: true,
      at: { x: Math.round(bank.x), y: Math.round(bank.y) },
      cursor: true,
      reason: 'Bank API takes https only',
    })
    await page.mouse.up()
    expect(await intents(page, 'connect')).toEqual([])

    // Output to input: one connect intent.
    const db = await port('db', 'in')
    await page.mouse.move(out.x - 30, out.y)
    await page.mouse.move(out.x, out.y)
    await page.mouse.down()
    await page.mouse.move(db.x, db.y, { steps: 12 })
    await page.mouse.up()
    expect(await intents(page, 'connect')).toEqual([
      { type: 'connect', source: { node: 'svc', port: 'out' }, target: { node: 'db', port: 'in' } },
    ])
    expect((await layer(page)).canvas).toBe(true)
  })

  test('with 2,000 components, Tab moves keyboard focus from component to component with a focus ring, and Enter opens the focused component', async ({
    page,
  }) => {
    const data = many([
      { id: 'a', x: 40, y: 40, w: 120, h: 48, shape: 'box', label: 'Web client' },
      { id: 'b', x: 200, y: 40, w: 120, h: 48, shape: 'box', label: 'Orders service' },
      { id: 'c', x: 360, y: 40, w: 120, h: 48, shape: 'box', label: 'Payments' },
    ])
    await open(page, data)
    const focused = () =>
      page.evaluate(() => {
        const node = document.activeElement?.closest('#host .sg-node')
        const ring = node?.querySelector('.sg-focus-ring')
        const shape = node?.querySelector('.sg-shape')?.getBoundingClientRect()
        const box = ring?.getBoundingClientRect()
        return {
          id: node?.getAttribute('data-id') ?? null,
          ring:
            !!ring &&
            !!shape &&
            !!box &&
            getComputedStyle(ring).display !== 'none' &&
            box.left < shape.left &&
            box.right > shape.right &&
            box.top < shape.top &&
            box.bottom > shape.bottom,
          canvas: !!document.querySelector('#host canvas.sg-node-canvas'),
        }
      })
    await page.focus('#host svg')
    await page.keyboard.press('Tab')
    expect(await focused()).toEqual({ id: 'a', ring: true, canvas: true })
    await page.keyboard.press('Tab')
    expect(await focused()).toEqual({ id: 'b', ring: true, canvas: true })
    await page.keyboard.press('Shift+Tab')
    expect(await focused()).toEqual({ id: 'a', ring: true, canvas: true })
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    expect(await intents(page, 'open')).toEqual([{ type: 'open', id: 'b', kind: 'node' }])
  })

  test('with 2,000 components, a cylinder, a person and a card are drawn as their own shapes, with the heat, breakpoint and scope overlays on them', async ({
    page,
  }) => {
    const data = many([
      { id: 'db', x: 40, y: 40, w: 140, h: 80, shape: 'cylinder', label: 'Orders DB' },
      { id: 'user', x: 240, y: 40, w: 140, h: 100, shape: 'person', label: 'Customer' },
      { id: 'card', x: 440, y: 50, w: 208, h: 64, label: 'Payments', composite: true },
    ])
    await open(page, data)
    expect(await layer(page)).toEqual({ canvas: true, svgNodes: 0 })

    // Points a rounded block would paint but these shapes leave empty, and the reverse.
    const shapes = await pixels(page, {
      cylinderCorner: [44.5, 44.5], // above the cylinder's top ellipse
      cylinderBody: [110.5, 80.5],
      personShoulder: [244.5, 50.5], // beside the head, above the body
      personHead: [310.5, 55.5],
      cardStratum: [651.5, 60.5], // right of the card, on the strata behind it
      cardBody: [540.5, 90.5],
    })
    expect(
      Object.fromEntries(Object.entries(shapes).map(([name, px]) => [name, px[3] > 0])),
      'painted'
    ).toEqual({
      cylinderCorner: false,
      cylinderBody: true,
      personShoulder: false,
      personHead: true,
      cardStratum: true,
      cardBody: true,
    })

    await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      w.g.setOverlay('heatmap', { values: { db: 0.97 }, domain: [0, 1] })
      w.g.setOverlay('breakpoints', { values: { user: {} } })
      w.g.setOverlay('scope', { ids: ['db', 'user'] })
    })
    expect(await layer(page)).toEqual({ canvas: true, svgNodes: 0 })
    const overlays = await pixels(page, {
      heatBar: [110.5, 118.5], // in the 4 px bar along the cylinder's bottom
      breakpoint: [240.5, 40.5], // the centre of the dot on the person's corner
      inScope: [110.5, 60.5],
      outOfScope: [540.5, 90.5],
    })
    // Down the left side of the cylinder's dashed scope outline, 6 px outside it.
    const scopeLine = await pixels(
      page,
      Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i, [34.5, 60.5 + i]]))
    )
    const accent = await colour(page, 'accent')
    const dashes = Object.values(scopeLine).map(px =>
      covered(px, accent) ? 'dash' : px[3] ? 'other' : 'gap'
    )
    expect({
      heatBar: near(overlays.heatBar, await colour(page, 'heat-critical')),
      breakpoint: near(overlays.breakpoint, await colour(page, 'danger')),
      inScope: overlays.inScope[3],
      outOfScope: Math.abs(overlays.outOfScope[3] - 0.3 * 255) <= 4,
      dashed: dashes.includes('dash') && dashes.includes('gap'),
    }).toEqual({ heatBar: true, breakpoint: true, inScope: 255, outOfScope: true, dashed: true })
  })
})
