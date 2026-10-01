// @ts-check
// Task 0413: stepping back one hop in a 60 s run takes under 100 ms. Stepping back restores the
// latest snapshot before the hop and replays forward (ADR 0023), so this measures a restore and
// up to one snapshot interval of replay.
//
// The run is a small, busy shop: a client orders every 5 to 15 ms, an API on two servers spends
// a moment and inserts into a database. Sixty simulated seconds make about 43,000 events. Each
// measure is the first step back in a fresh run, whose nearest snapshot before the hop is an
// automatic one, up to 10,000 events back; later steps find the snapshots their pauses left. The
// slowest of five runs, with different seeds, counts.

const PAGE = '/tools/testing/browser/harness.html'
const RUNS = 5

/** @param {{ browser: import('@playwright/test').Browser, baseURL: string }} options */
export async function bench({ browser, baseURL }) {
  const page = await browser.newPage()
  try {
    await page.goto(baseURL + PAGE)
    const times = await page.evaluate(async runs => {
      const sim = await import('/packages/sim/src/index.js')
      const uniform = (/** @type {number} */ min, /** @type {number} */ max) => ({
        kind: 'uniform',
        min,
        max,
      })
      const type = (/** @type {string} */ id, /** @type {object} */ rest) => ({
        strataApi: '^1.0',
        id,
        name: id,
        version: '1.0.0',
        ...rest,
      })
      const shop = (/** @type {number} */ seed) =>
        sim.createRun({
          seed,
          nodes: [
            {
              id: 'client',
              manifest: type('t.client', {
                ports: [{ name: 'out', direction: 'out' }],
                state: { sent: { type: 'integer', initial: 0 } },
                methods: { public: {} },
              }),
              behaviour: {
                init: (/** @type {any} */ ctx) => ctx.schedule(0, 'tick'),
                async onTimer(/** @type {any} */ _timer, /** @type {any} */ ctx) {
                  ctx.schedule(5 + ctx.random() * 10, 'tick')
                  try {
                    await ctx.send('out', 'order', { n: ++ctx.state.sent })
                  } catch {
                    ctx.metric('failed', 1)
                  }
                },
              },
            },
            {
              id: 'api',
              manifest: type('t.api', {
                ports: [
                  { name: 'in', direction: 'in', exposes: ['order'] },
                  { name: 'db', direction: 'out' },
                ],
                servers: { count: [2], backlog: 3, timeout: 20 },
                state: { orders: { type: 'integer', initial: 0 } },
                methods: { public: { order: {} } },
              }),
              behaviour: {
                public: {
                  async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
                    await ctx.spend(uniform(1, 8))
                    const id = await ctx.send('db', 'insert', { n: msg.body.n })
                    ctx.state.orders++
                    return { id }
                  },
                },
              },
            },
            {
              id: 'db',
              manifest: type('t.db', {
                ports: [{ name: 'in', direction: 'in', exposes: ['insert'] }],
                state: { next: { type: 'integer', initial: 0 } },
                methods: { public: { insert: { latency: uniform(0.5, 2) } } },
              }),
              behaviour: {
                public: {
                  insert: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ++ctx.state.next,
                },
              },
            },
          ],
          edges: [
            {
              id: 'orders',
              from: { node: 'client', port: 'out' },
              to: { node: 'api', port: 'in' },
              props: { latency: uniform(1, 3), timeout: 30, retries: 1, retryBackoff: 5 },
            },
            {
              id: 'inserts',
              from: { node: 'api', port: 'db' },
              to: { node: 'db', port: 'in' },
              props: { latency: 1 },
            },
          ],
        })
      const out = []
      for (let seed = 1; seed <= runs + 1; seed++) {
        const run = shop(seed)
        await run.runToEnd({ untilUs: 60_000_000 })
        const start = performance.now()
        await run.step(-1, 'hop')
        // The first run warms the engine up.
        if (seed > 1) out.push(performance.now() - start)
      }
      return out
    }, RUNS)
    return [
      {
        name: 'stepping: one hop back in a 60 s run',
        value: Math.max(...times),
        unit: 'ms',
        budget: 100,
      },
    ]
  } finally {
    await page.close()
  }
}
