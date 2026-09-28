// @ts-check
// Eng §15: frame time at 500 visible components while panning stays under 16 ms (task 0207).
//
// 500 cards and 480 edges fit the view at about 21% zoom, the band design system §6 draws with
// icons and titles. Each frame pans the view in a requestAnimationFrame callback and measures the
// main thread until a message posted there arrives, which is after that frame's style, layout
// and paint.

const HARNESS = '/packages/graph/test/browser/harness.html'
const FRAMES = 150
const VIEW = { width: 1280, height: 800 }

/**
 * @param {{ browser: import('@playwright/test').Browser, baseURL: string }} context
 * @returns {Promise<import('./run.js').Measure[]>}
 */
export async function bench({ browser, baseURL }) {
  const page = await browser.newPage({ viewport: VIEW })
  try {
    await page.goto(baseURL + HARNESS)
    await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
    const times = await page.evaluate(
      async ({ frames, view }) => {
        const w = /** @type {any} */ (window)
        const host = /** @type {HTMLElement} */ (document.getElementById('host'))
        host.style.width = `${view.width}px`
        host.style.height = `${view.height}px`
        /** @type {object[]} */
        const nodes = []
        /** @type {object[]} */
        const edges = []
        for (let row = 0; row < 20; row++)
          for (let col = 0; col < 25; col++) {
            const id = `n${row}-${col}`
            nodes.push({
              id,
              x: col * 240,
              y: row * 120,
              label: `Service ${row}-${col}`,
              sublabel: 'Service, 2 instances',
              ports: [
                { id: 'in', side: 'left', direction: 'in' },
                { id: 'out', side: 'right', direction: 'out' },
              ],
            })
            if (col)
              edges.push({
                id: `e${row}-${col}`,
                source: { node: `n${row}-${col - 1}`, port: 'out' },
                target: { node: id, port: 'in' },
              })
          }
        w.makeGraph({}, { nodes, edges, frames: [], annotations: [] }, false)
        const k = view.width / (25 * 240)
        const next = () => new Promise(resolve => requestAnimationFrame(resolve))
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
      { frames: FRAMES, view: VIEW }
    )
    const sorted = [...times].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    return [
      { name: 'Pan 500 components: 95th percentile frame', value: p95, unit: 'ms', budget: 16 },
    ]
  } finally {
    await page.close()
  }
}
