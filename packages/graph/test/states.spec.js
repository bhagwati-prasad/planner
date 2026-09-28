// @ts-check
// Node states of design system §6 (task 0209), each as a visual snapshot of the default component
// card in light and dark themes. Baselines exist only once the human has approved them.
import { test, expect } from '../../../tools/testing/playwright.js'

const HARNESS = '/packages/graph/test/browser/harness.html'

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="5" width="16" height="6" rx="1.5"/><rect x="4" y="13" width="16" height="6" rx="1.5"/><path d="M7 8h2M7 16h2"/></svg>'

/** @param {string} id @param {number} x @param {Record<string, unknown>} [extra] */
const card = (id, x, extra = {}) => ({
  id,
  x,
  y: 48,
  w: 184,
  h: 56,
  label: 'Orders service',
  sublabel: 'Service, 3 instances',
  icon: ICON,
  ports: [
    { id: 'in', side: 'left', direction: 'in' },
    { id: 'out', side: 'right', direction: 'out' },
  ],
  ...extra,
})

/**
 * @typedef {import('@playwright/test').Page} Page
 * @typedef {object} State
 * @property {object[]} nodes
 * @property {string[]} [select]
 * @property {string} [refuse]  canConnect refuses every connection with this reason
 * @property {(page: Page) => Promise<void>} [act]  interaction that holds the state
 */

/** @param {Page} page @param {string} id */
const centre = (page, id) => page.evaluate(i => /** @type {any} */ (window).centerOf(i), id)
/** @param {Page} page @param {string} node @param {string} port */
const port = (page, node, port) =>
  page.evaluate(([n, p]) => /** @type {any} */ (window).portOf(n, p), [node, port])

/** Drags from a's output port and holds the pointer over b's input port. @param {Page} page */
async function connectOver(page) {
  const from = await port(page, 'a', 'out')
  const to = await port(page, 'b', 'in')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
}

/** Every node state of design system §6, in its table's order. @type {Record<string, State>} */
const STATES = {
  hover: {
    nodes: [card('a', 48)],
    act: async page => {
      const c = await centre(page, 'a')
      await page.mouse.move(c.x, c.y)
    },
  },
  selected: { nodes: [card('a', 48)], select: ['a'] },
  'multi-selected': { nodes: [card('a', 48), card('b', 288)], select: ['a', 'b'] },
  'keyboard-focus': {
    nodes: [card('a', 48)],
    act: async page => {
      await page.focus('#host svg')
      await page.keyboard.press('Tab')
    },
  },
  dragging: {
    nodes: [card('a', 48)],
    act: async page => {
      const c = await centre(page, 'a')
      await page.mouse.move(c.x, c.y)
      await page.mouse.down()
      await page.mouse.move(c.x + 120, c.y + 24, { steps: 8 })
    },
  },
  'valid-connect-target': { nodes: [card('a', 48), card('b', 328)], act: connectOver },
  'invalid-connect-target': {
    nodes: [card('a', 48), card('b', 328)],
    refuse: 'Orders service accepts http only',
    act: connectOver,
  },
  planned: { nodes: [card('a', 48, { status: 'planned' })] },
  deprecated: { nodes: [card('a', 48, { status: 'deprecated' })] },
  'by-reference': { nodes: [card('a', 48, { readOnly: true })], select: ['a'] },
  'missing-component': {
    nodes: [card('a', 48, { missing: 'acme.message-queue 1.2.0', icon: undefined })],
  },
  failing: { nodes: [card('a', 48, { failing: true })] },
  'out-of-scope': { nodes: [card('a', 48, { outOfScope: true })] },
  'run-only-change': { nodes: [card('a', 48, { runChanges: ['concurrency 16 → 32'] })] },
  'context-ghost': { nodes: [card('a', 48, { ghost: true })] },
}

test(
  'every component state in ds §6 matches its visual snapshot in light and dark themes',
  { tag: '@visual' },
  async ({ page }) => {
    await page.goto(HARNESS)
    await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
    const host = await page.locator('#host').boundingBox()
    if (!host) throw new Error('no #host')
    const clip = { x: host.x, y: host.y, width: 560, height: 160 }
    for (const theme of ['light', 'dark'])
      for (const [name, state] of Object.entries(STATES)) {
        await page.mouse.move(host.x + 900, host.y + 600)
        await page.evaluate(
          ({ theme, nodes, select, refuse }) => {
            const w = /** @type {any} */ (window)
            const options = refuse ? { theme, canConnect: () => refuse } : { theme }
            w.makeGraph(options, { nodes, edges: [], frames: [], annotations: [] }, false)
            w.g.setTransform({ x: 0, y: 0, k: 1 })
            if (select) w.g.select(select)
          },
          { theme, nodes: state.nodes, select: state.select, refuse: state.refuse }
        )
        await state.act?.(page)
        await expect
          .soft(page, `${name} in ${theme} theme`)
          .toHaveScreenshot(`${name}-${theme}.png`, { clip })
        await page.mouse.up()
      }
  }
)
