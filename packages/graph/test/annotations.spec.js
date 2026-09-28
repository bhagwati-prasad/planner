// @ts-check
// Frames, zones, boundaries and annotations in strata-graph (task 0206): the level frame of
// design system §5 with its boundary ports, and the frames and annotations of design system §6.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/**
 * @typedef {import('@playwright/test').Page} Page
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 */

/** @param {string} id @param {number} x @param {number} y @param {Record<string, unknown>} [extra] */
const card = (id, x, y, extra = {}) => ({
  id,
  x,
  y,
  w: 184,
  h: 56,
  label: id === 'gw' ? 'API gateway' : 'Orders service',
  ports: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
  ...extra,
})

/**
 * A boundary port centred on the given point of a frame's side. The host places it; the graph
 * sizes and draws it.
 * @param {string} id @param {'left'|'right'|'top'|'bottom'} side @param {number} x @param {number} y
 */
const boundaryPort = (id, side, x, y) => ({
  id,
  shape: 'boundary-port',
  side,
  x: x - 6,
  y: y - 6,
  label: id,
  locked: true,
})

/** A level frame at depth 1 with boundary ports on three sides and one component inside. */
const LEVEL = {
  frames: [
    {
      id: 'level',
      kind: 'system',
      level: 1,
      x: 120,
      y: 40,
      w: 360,
      h: 200,
      label: 'Payments system',
      locked: true,
    },
  ],
  nodes: [
    boundaryPort('in', 'left', 120, 140),
    boundaryPort('out', 'right', 480, 140),
    boundaryPort('events', 'top', 300, 40),
    card('gw', 208, 112),
  ],
  edges: [{ id: 'map', source: { node: 'in', port: 'port' }, target: { node: 'gw', port: 'in' } }],
  annotations: [],
}

/** @param {Page} page @param {object} data @param {string} [theme] */
async function open(page, data, theme = 'light') {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(
    ({ data, theme }) => {
      const w = /** @type {any} */ (window)
      w.makeGraph({ theme }, { frames: [], nodes: [], edges: [], annotations: [], ...data }, false)
      w.g.setTransform({ x: 0, y: 0, k: 1 })
    },
    { data, theme }
  )
}

test.describe('strata-graph frames and annotations', () => {
  test('the level frame draws boundary ports on its edge with labels outside', async ({ page }) => {
    await open(page, LEVEL)
    const ports = await page.evaluate(() => {
      // World boxes: geometry (getBBox) in a node's own space, moved by the node's position.
      const world = (/** @type {Element|null} */ el) => {
        if (!el) return null
        const b = /** @type {SVGGraphicsElement} */ (el).getBBox()
        const node = /** @type {Element} */ (el.closest('.sg-node'))
        const [x, y] = (node.getAttribute('transform') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [
          0, 0,
        ]
        const r = (/** @type {number} */ n) => Math.round(n * 10) / 10
        return { x: r(b.x + x), y: r(b.y + y), w: r(b.width), h: r(b.height) }
      }
      return Object.fromEntries(
        ['in', 'out', 'events'].map(id => {
          const node = document.querySelector(`#host .sg-node[data-id="${id}"]`)
          return [
            id,
            {
              disc: world(node?.querySelector('[data-part="disc"]') ?? null),
              label: world(node?.querySelector('.sg-bp-label') ?? null),
              text: node?.querySelector('.sg-bp-label')?.textContent,
            },
          ]
        })
      )
    })
    // 12 px half-discs whose flat side lies on the frame's edge, bulging into the level.
    expect(ports.in.disc).toEqual({ x: 120, y: 134, w: 6, h: 12 })
    expect(ports.out.disc).toEqual({ x: 474, y: 134, w: 6, h: 12 })
    expect(ports.events.disc).toEqual({ x: 294, y: 40, w: 12, h: 6 })
    // Each label is outside the frame, next to its port.
    expect(ports.in.text).toBe('in')
    const label = /** @type {Record<string, Box>} */ ({
      in: ports.in.label,
      out: ports.out.label,
      events: ports.events.label,
    })
    expect(label.in.x + label.in.w, 'left of the frame').toBeLessThanOrEqual(118)
    expect(label.in.x + label.in.w).toBeGreaterThan(100)
    expect(label.out.x, 'right of the frame').toBeGreaterThanOrEqual(482)
    expect(label.out.x).toBeLessThan(500)
    expect(label.events.y + label.events.h, 'above the frame').toBeLessThanOrEqual(38)
    expect(label.events.y + label.events.h).toBeGreaterThan(20)
  })

  test('moving a frame moves its contents in one intent', async ({ page }) => {
    await page.goto(HARNESS)
    await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
    const title = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      w.makeGraph({}, w.sample(), false)
      w.g.setTransform({ x: 0, y: 0, k: 1 })
      // The zone is at (300, 60); its title bar is its top 24 px.
      return w.clientOf(500, 72)
    })
    await page.mouse.move(title.x, title.y)
    await page.mouse.down()
    await page.mouse.move(title.x + 50, title.y + 30, { steps: 10 })
    await page.mouse.up()
    const moves = await page.evaluate(() =>
      /** @type {any} */ (window).intents.filter((/** @type {any} */ i) => i.type === 'move')
    )
    expect(moves.length).toBe(1)
    const at = Object.fromEntries(
      moves[0].items.map((/** @type {any} */ i) => [i.id, { x: i.x, y: i.y }])
    )
    expect(at).toEqual({
      zone: { x: 350, y: 90 },
      svc: { x: 390, y: 150 },
      db: { x: 390, y: 290 },
    })
  })

  test("a trust boundary's lock leaves a by-reference component's lock in the glyph colour", async ({
    page,
  }) => {
    await open(page, {
      frames: [{ id: 'trust', kind: 'trust-boundary', x: 24, y: 24, w: 240, h: 120 }],
      nodes: [card('svc', 48, 64, { parent: 'trust', readOnly: true })],
    })
    const strokes = await page.evaluate(() => {
      const stroke = (/** @type {string} */ sel) => {
        const el = document.querySelector(`#host ${sel}`)
        return el ? getComputedStyle(el).stroke : null
      }
      return { node: stroke('.sg-node .sg-lock'), frame: stroke('.sg-frame .sg-frame-lock') }
    })
    // Design system §3: Basalt 500 for glyphs, Basalt 600 for the trust boundary.
    expect(strokes).toEqual({ node: 'rgb(98, 108, 124)', frame: 'rgb(79, 88, 102)' })
  })

  test('annotations render above components and are included in exports', async ({ page }) => {
    await open(page, {
      nodes: [card('svc', 40, 40)],
      annotations: [
        { id: 'note', kind: 'sticky', x: 160, y: 60, text: 'Retries are idempotent' },
        {
          id: 'call',
          kind: 'callout',
          x: 360,
          y: 140,
          w: 160,
          h: 40,
          text: 'Hot path',
          target: 'svc',
        },
        { id: 'words', kind: 'text', x: 40, y: 220, w: 200, h: 24, text: 'Checkout flow' },
      ],
    })
    const top = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      // Inside both the service and the note.
      const p = w.clientOf(200, 80)
      return document.elementFromPoint(p.x, p.y)?.closest('[data-id]')?.getAttribute('data-id')
    })
    expect(top, 'the note covers the component').toBe('note')
    const exported = await page.evaluate(() => {
      const svg = /** @type {any} */ (window).g.exportSVG()
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      const order = [...doc.querySelectorAll('[data-id]')].map(el => el.getAttribute('data-id'))
      return {
        texts: [...doc.querySelectorAll('.sg-annotation')].map(el => el.textContent),
        order,
      }
    })
    expect(exported.texts).toEqual(['Retries are idempotent', 'Hot path', 'Checkout flow'])
    expect(exported.order.indexOf('note')).toBeGreaterThan(exported.order.indexOf('svc'))
  })

  test(
    'every frame and annotation kind matches its visual snapshot in light and dark themes',
    { tag: '@visual' },
    async ({ page }) => {
      /** @type {Record<string, object>} */
      const scenes = {
        level: LEVEL,
        frames: {
          frames: [
            { id: 'group', kind: 'group', x: 24, y: 24, w: 232, h: 128, label: 'Checkout' },
            { id: 'zone', kind: 'zone', x: 280, y: 24, w: 232, h: 128, label: 'eu-west-1a' },
            {
              id: 'trust',
              kind: 'trust-boundary',
              x: 536,
              y: 24,
              w: 232,
              h: 128,
              label: 'Internet to VPC',
            },
          ],
          nodes: [
            card('a', 48, 64, { parent: 'group' }),
            card('b', 304, 64, { parent: 'zone' }),
            card('c', 560, 64, { parent: 'trust' }),
          ],
        },
        annotations: {
          nodes: [card('svc', 40, 104)],
          annotations: [
            { id: 'region', kind: 'region', x: 24, y: 88, w: 216, h: 88 },
            { id: 'note', kind: 'sticky', x: 272, y: 148, text: 'Retries are idempotent' },
            {
              id: 'call',
              kind: 'callout',
              x: 480,
              y: 40,
              w: 160,
              h: 40,
              text: 'Hot path',
              target: 'svc',
            },
            {
              id: 'title',
              kind: 'text',
              x: 480,
              y: 112,
              w: 240,
              h: 24,
              size: 'title',
              text: 'Checkout flow',
            },
            {
              id: 'body',
              kind: 'text',
              x: 480,
              y: 144,
              w: 240,
              h: 24,
              text: 'Card data stays in the zone',
            },
          ],
        },
      }
      for (const theme of ['light', 'dark'])
        for (const [name, data] of Object.entries(scenes)) {
          await open(page, data, theme)
          const host = await page.locator('#host').boundingBox()
          if (!host) throw new Error('no #host')
          await expect
            .soft(page, `${name} in ${theme} theme`)
            .toHaveScreenshot(`${name}-${theme}.png`, {
              clip: { x: host.x, y: host.y, width: 800, height: 280 },
            })
        }
    }
  )
})
