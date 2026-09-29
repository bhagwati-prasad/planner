// @ts-check
// Eng §15: frame time while panning stays under 16 ms, at 500 visible components (task 0207) and
// at 2,000, where the nodes are one Canvas 2D image (task 0211).
//
// The components sit on a grid, each joined to the one before it in its row, and fill the view:
// 500 cards at about 21% zoom, the band design system §6 draws with icons and titles, and 2,000
// cards, databases, people and boxes under a heatmap at about 11%. Each frame pans the view in a
// requestAnimationFrame callback and measures the main thread until a message posted there
// arrives, which is after that frame's style, layout and paint.

const HARNESS = '/packages/graph/test/browser/harness.html'
const FRAMES = 150
const VIEW = { width: 1280, height: 800 }
const SHAPES = ['card', 'cylinder', 'person', 'box']

/**
 * The 95th-percentile frame time, in ms, while panning a grid of components.
 * @param {import('@playwright/test').Page} page
 * @param {{ rows: number, cols: number, mixed: boolean }} grid mixed: four shapes and a heatmap
 */
async function panFrame(page, grid) {
  const times = await page.evaluate(
    async ({ frames, view, grid, shapes }) => {
      const w = /** @type {any} */ (window)
      const host = /** @type {HTMLElement} */ (document.getElementById('host'))
      host.style.width = `${view.width}px`
      host.style.height = `${view.height}px`
      /** @type {object[]} */
      const nodes = []
      /** @type {object[]} */
      const edges = []
      /** @type {Record<string, number>} */
      const heat = {}
      for (let row = 0; row < grid.rows; row++)
        for (let col = 0; col < grid.cols; col++) {
          const id = `n${row}-${col}`
          nodes.push({
            id,
            x: col * 240,
            y: row * 120,
            ...(grid.mixed ? { shape: shapes[(row + col) % 4], w: 140, h: 80 } : {}),
            label: `Service ${row}-${col}`,
            sublabel: 'Service, 2 instances',
            ports: [
              { id: 'in', side: 'left', direction: 'in' },
              { id: 'out', side: 'right', direction: 'out' },
            ],
          })
          heat[id] = ((row * 7 + col * 3) % 10) / 10
          if (col)
            edges.push({
              id: `e${row}-${col}`,
              source: { node: `n${row}-${col - 1}`, port: 'out' },
              target: { node: id, port: 'in' },
            })
        }
      w.makeGraph({}, { nodes, edges, frames: [], annotations: [] }, false)
      if (grid.mixed) w.g.setOverlay('heatmap', { values: heat, domain: [0, 1] })
      const k = view.width / (grid.cols * 240)
      const next = () => new Promise(resolve => requestAnimationFrame(resolve))
      w.g.setTransform({ x: 8, y: 8, k })
      await next()
      await next()
      /** @type {number[]} */
      const times = []
      for (let i = 0; i < frames; i++)
        await new Promise(done =>
          requestAnimationFrame(() => {
            const t0 = performance.now()
            // Back and forth by 4 px a frame, so the view stays over the components.
            const dx = (i % 40 < 20 ? i % 20 : 20 - (i % 20)) * 4
            w.g.setTransform({ x: 8 + dx, y: 8, k })
            const channel = new MessageChannel()
            channel.port1.onmessage = () => {
              times.push(performance.now() - t0)
              done(undefined)
            }
            channel.port2.postMessage(null)
          })
        )
      return times
    },
    { frames: FRAMES, view: VIEW, grid, shapes: SHAPES }
  )
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.95)]
}

/**
 * @param {{ browser: import('@playwright/test').Browser, baseURL: string }} context
 * @returns {Promise<import('./run.js').Measure[]>}
 */
export async function bench({ browser, baseURL }) {
  const page = await browser.newPage({ viewport: VIEW })
  try {
    /** @type {import('./run.js').Measure[]} */
    const measures = []
    for (const [count, grid] of /** @type {const} */ ([
      [500, { rows: 20, cols: 25, mixed: false }],
      [2000, { rows: 40, cols: 50, mixed: true }],
    ])) {
      await page.goto(baseURL + HARNESS)
      await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
      measures.push({
        name: `Pan ${count.toLocaleString('en')} components: 95th percentile frame`,
        value: await panFrame(page, grid),
        unit: 'ms',
        budget: 16,
      })
    }
    return measures
  } finally {
    await page.close()
  }
}
