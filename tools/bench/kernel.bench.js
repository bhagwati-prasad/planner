// @ts-check
// Eng §15 and spec §11: the kernel handles at least 200,000 simple events per second (task 0401).
//
// A simple event does what a component's timer does at its smallest: it draws a delay from its
// component's random stream and schedules itself again. A thousand components keep a thousand
// events pending, so the queue works at a realistic depth. After a warm-up, the best of three
// runs of a million events counts, as a shared machine's slowest runs say more about the machine.

const PAGE = '/tools/testing/browser/harness.html'
const COMPONENTS = 1_000
const EVENTS = 1_000_000
const RUNS = 3

/** @param {{ browser: import('@playwright/test').Browser, baseURL: string }} options */
export async function bench({ browser, baseURL }) {
  const page = await browser.newPage()
  try {
    await page.goto(baseURL + PAGE)
    const rates = await page.evaluate(
      async ({ components, events, runs }) => {
        const { Kernel, createStreams } = await import('/packages/sim/src/index.js')
        /** @param {number} total */
        const run = total => {
          const kernel = new Kernel()
          const streams = createStreams(42)
          for (let i = 0; i < components; i++) {
            const stream = streams.stream(`component-${i}`)
            kernel.schedule(stream.nextU32() % 1000, { type: 'tick', stream })
          }
          /** @param {{ stream: { nextU32: () => number } }} event @param {any} k */
          const tick = (event, k) => {
            if (k.processed + components <= total)
              k.schedule(1 + (event.stream.nextU32() % 1000), event)
          }
          const start = performance.now()
          kernel.run({ tick }, { maxEvents: total + components })
          return kernel.processed / ((performance.now() - start) / 1000)
        }
        run(events / 10)
        return Array.from({ length: runs }, () => run(events))
      },
      { components: COMPONENTS, events: EVENTS, runs: RUNS }
    )
    return [
      {
        name: 'kernel: simple events handled per second',
        value: Math.max(...rates),
        unit: 'events/s',
        budget: 200_000,
        better: /** @type {const} */ ('higher'),
      },
    ]
  } finally {
    await page.close()
  }
}
