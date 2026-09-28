// @ts-check
// Selection, dragging and connecting in strata-graph (task 0204): every gesture ends in an intent,
// and nothing changes until the host answers with setData.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

/**
 * @typedef {import('@playwright/test').Page} Page
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * Opens the harness on a graph at 100% zoom: the sample unless `data` is given.
 * @param {Page} page
 * @param {{ data?: object, autoApply?: boolean, select?: string[], refuse?: { node: string, reason: string } }} [setup]
 *   autoApply: the harness applies intents; refuse: canConnect refuses the node with the reason
 */
async function open(page, setup = {}) {
  await page.goto(HARNESS)
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  await page.evaluate(({ data, autoApply = false, select, refuse }) => {
    const w = /** @type {any} */ (window)
    const canConnect = (/** @type {any} */ _, /** @type {any} */ t) =>
      t.node === refuse?.node ? refuse.reason : true
    w.makeGraph(refuse ? { canConnect } : {}, data ?? w.sample(), autoApply)
    w.g.setTransform({ x: 0, y: 0, k: 1 })
    if (select) w.g.select(select)
  }, setup)
}

/** @param {Page} page @param {string} [type] */
const intents = (page, type) =>
  page.evaluate(t => /** @type {any} */ (window).intents.filter(i => !t || i.type === t), type)
/** @param {Page} page @param {string} id @returns {Promise<Point>} */
const centre = (page, id) => page.evaluate(i => /** @type {any} */ (window).centerOf(i), id)
/** @param {Page} page @param {string} node @param {string} port @returns {Promise<Point>} */
const portAt = (page, node, port) =>
  page.evaluate(([n, p]) => /** @type {any} */ (window).portOf(n, p), [node, port])
/** @param {Page} page @param {number} x @param {number} y @returns {Promise<Point>} */
const client = (page, x, y) =>
  page.evaluate(([a, b]) => /** @type {any} */ (window).clientOf(a, b), [x, y])
/** @param {Page} page @param {string} id */
const transformOf = (page, id) =>
  page.evaluate(
    i => document.querySelector(`#host .sg-node[data-id="${i}"]`)?.getAttribute('transform'),
    id
  )

/** Clicks while holding a key (page.mouse.click takes no modifiers). @param {Page} page @param {Point} at @param {string} key */
async function clickWith(page, at, key) {
  await page.keyboard.down(key)
  await page.mouse.click(at.x, at.y)
  await page.keyboard.up(key)
}

/** @param {Page} page @param {Point} from @param {Point} to */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test.describe('strata-graph interaction', () => {
  test('dropping a dragged component emits one move intent, and it snaps back until setData confirms', async ({
    page,
  }) => {
    await open(page)
    const before = await transformOf(page, 'svc')
    const c = await centre(page, 'svc')
    await drag(page, c, { x: c.x + 100, y: c.y + 40 })
    const moves = await intents(page, 'move')
    expect(moves.length).toBe(1)
    const [item] = moves[0].items
    expect(item).toMatchObject({ id: 'svc', kind: 'node', x: 440, y: 160 })
    expect(await transformOf(page, 'svc'), 'nothing moves until the host says so').toBe(before)
    await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      const svc = w.data.nodes.find((/** @type {any} */ n) => n.id === 'svc')
      Object.assign(svc, { x: 440, y: 160 })
      w.g.setData(w.data)
    })
    expect(await transformOf(page, 'svc')).toBe('translate(440,160)')
  })

  test('connecting an output port to an input port emits a connect intent; an invalid target shows the invalid state', async ({
    page,
  }) => {
    await open(page, { refuse: { node: 'bank', reason: 'Bank API takes https only' } })
    // Over a refused port: the invalid state, and no intent on release.
    const out = await portAt(page, 'svc', 'out')
    const bank = await portAt(page, 'bank', 'in')
    await page.mouse.move(out.x, out.y)
    await page.mouse.down()
    await page.mouse.move(bank.x, bank.y, { steps: 10 })
    const invalid = await page.evaluate(() => ({
      ring: !!document.querySelector('#host .sg-node[data-id="bank"] .sg-port.sg-port-invalid'),
      cursor: document.querySelector('#host svg')?.classList.contains('sg-connect-invalid'),
      reason: document.querySelector('#host .sg-refusal text')?.textContent,
    }))
    expect(invalid).toEqual({ ring: true, cursor: true, reason: 'Bank API takes https only' })
    await page.mouse.up()
    expect(await intents(page, 'connect')).toEqual([])

    // Output to input: one connect intent.
    const db = await portAt(page, 'db', 'in')
    await drag(page, await portAt(page, 'svc', 'out'), db)
    const connects = await intents(page, 'connect')
    expect(connects).toEqual([
      { type: 'connect', source: { node: 'svc', port: 'out' }, target: { node: 'db', port: 'in' } },
    ])
  })

  test('the marquee selects every component whose bounds it intersects', async ({ page }) => {
    await open(page)
    // From empty canvas left of the client to a point inside the service: it touches both.
    await drag(page, await client(page, 20, 140), await client(page, 360, 200))
    const selected = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      const ids = w.intents.filter((/** @type {any} */ i) => i.type === 'select').at(-1)?.ids ?? []
      // An edge between two selected components comes along; this test is about components.
      return ids.filter((/** @type {string} */ id) =>
        w.data.nodes.some((/** @type {any} */ n) => n.id === id)
      )
    })
    expect(selected.sort()).toEqual(['client', 'svc'])
  })

  test('shift+click adds to the selection and Mod+click toggles', async ({ page }) => {
    await open(page, { autoApply: true })
    const svc = await centre(page, 'svc')
    const db = await centre(page, 'db')
    await page.mouse.click(svc.x, svc.y)
    await clickWith(page, db, 'Shift')
    await clickWith(page, svc, 'Shift')
    expect((await intents(page, 'select')).at(-1).ids.sort(), 'Shift only adds').toEqual([
      'db',
      'svc',
    ])
    await clickWith(page, svc, 'ControlOrMeta')
    expect((await intents(page, 'select')).at(-1).ids, 'Mod toggles').toEqual(['db'])
  })

  test("a selected edge's add-waypoint handle sits clear of its label", async ({ page }) => {
    const node = (/** @type {string} */ id, /** @type {number} */ x) => ({
      id,
      x,
      y: 52,
      w: 184,
      h: 56,
      ports: [
        { id: 'in', side: 'left', direction: 'in' },
        { id: 'out', side: 'right', direction: 'out' },
      ],
    })
    const edge = {
      id: 'e',
      label: 'checkout',
      source: { node: 'a', port: 'out' },
      target: { node: 'b', port: 'in' },
    }
    const nodes = [node('a', 40), node('b', 376)]
    await open(page, { data: { nodes, edges: [edge], frames: [], annotations: [] }, select: ['e'] })
    const boxes = await page.evaluate(() => {
      const box = (/** @type {string} */ sel) => {
        const el = /** @type {SVGGraphicsElement|null} */ (document.querySelector(`#host ${sel}`))
        const r = el?.getBoundingClientRect()
        return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
      }
      return { pill: box('.sg-edge-label-bg'), handle: box('.sg-waypoint-new') }
    })
    const { pill, handle } = boxes
    expect(pill && handle, 'the edge has a label and an add-waypoint handle').toBeTruthy()
    if (!pill || !handle) return
    const apart =
      handle.x >= pill.x + pill.w ||
      handle.x + handle.w <= pill.x ||
      handle.y >= pill.y + pill.h ||
      handle.y + handle.h <= pill.y
    expect(apart, JSON.stringify(boxes)).toBe(true)
  })

  test("dragging a handle of a multi-selection's bounding box resizes the group in one move intent whose items carry their new sizes", async ({
    page,
  }) => {
    await open(page, { select: ['svc', 'db'] })
    const handle = await page.evaluate(() => {
      const el = document.querySelector('#host .sg-group-handle.sg-handle-se')
      const r = el?.getBoundingClientRect()
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
    })
    expect(handle, 'the group box has resize handles').not.toBeNull()
    if (!handle) return
    await drag(page, handle, { x: handle.x + 92, y: handle.y + 106 })
    const moves = await intents(page, 'move')
    expect(moves.length).toBe(1)
    const items = Object.fromEntries(moves[0].items.map((/** @type {any} */ i) => [i.id, i]))
    expect(Object.keys(items).sort()).toEqual(['db', 'svc'])
    // The box grows from its top-left corner, so everything scales away from it.
    expect(items.svc).toMatchObject({ x: 340, y: 120 })
    expect(items.svc.w).toBeGreaterThan(160)
    expect(items.svc.h).toBeGreaterThan(64)
    expect(items.db.y).toBeGreaterThan(260)
    expect(items.db.w).toBeGreaterThan(160)
    expect(items.db.h).toBeGreaterThan(70)
  })
})
