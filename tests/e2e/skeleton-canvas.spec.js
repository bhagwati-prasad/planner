// @ts-check
// The walking skeleton on the canvas (task 0010): the offline app draws a client, a service and
// the edge between them with D3; Run sends one request through the simulation worker, animates
// it along the edge and reports the response time.
import { test, expect } from '../../tools/testing/playwright.js'

/**
 * Opens dist/strata.html and builds the skeleton project through the console API.
 * @param {import('@playwright/test').Page} page
 * @param {(path: string) => string} urlFor
 */
async function openSkeleton(page, urlFor) {
  await page.goto(urlFor('dist/strata.html'))
  await page.waitForFunction(() => /** @type {any} */ (window).strataApp?.shell?.canvas?.graph)
  await page.evaluate(async () => {
    const strata = /** @type {any} */ (window).strata
    await strata.projects.create('Skeleton')
    const root = (await strata.projects.open('Skeleton')).root
    const client = root.add('client', { name: 'Client' })
    const orders = root.add('service', { name: 'Orders' })
    root.connect(client.port('out'), orders.port('in'), { type: 'http' })
  })
}

test('from file:// the page renders two component elements and one edge element', async ({
  page,
  urlFor,
}) => {
  await openSkeleton(page, urlFor)
  await expect(page.locator('strata-canvas .sg-node')).toHaveCount(2)
  await expect(page.locator('strata-canvas .sg-edge')).toHaveCount(1)
})

test('clicking Run animates a dot along the edge and shows the response time', async ({
  page,
  urlFor,
}) => {
  await openSkeleton(page, urlFor)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const dot = page.locator('strata-canvas .sg-token')
  await expect(dot).toHaveCount(1)
  const start = await dot.getAttribute('cx')
  await expect.poll(() => dot.getAttribute('cx')).not.toBe(start)
  await expect(page.getByText('Response in 22 ms')).toBeVisible()
  await expect(dot).toHaveCount(0)
})

test("the page works with Playwright's offline mode enabled", async ({
  page,
  context,
  mode,
  urlFor,
}) => {
  /** @type {string[]} */
  const network = []
  page.on('request', request => {
    const url = request.url()
    // Served, the app keeps a live-reload channel to the server, which reconnects on its own.
    if (!/^(file|blob|data):/.test(url) && !url.endsWith('/api/events')) network.push(url)
  })
  await openSkeleton(page, urlFor)
  // From file:// the page loads without touching the network. Served, it comes from the local
  // server. Offline mode goes on once the page has loaded: WebKit's emulation also refuses
  // file:// and blob: loads, which no real network outage does.
  if (mode === 'file') expect(network).toEqual([])
  network.length = 0
  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByText('Response in 22 ms')).toBeVisible()
    expect(network).toEqual([])
  } finally {
    await context.setOffline(false)
  }
})
