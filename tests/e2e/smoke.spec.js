// @ts-check
// Smoke test (task 0007): the offline build opens with its starter library and no errors, from
// file:// and from the local server, in every browser project.
import { test, expect } from '../../tools/testing/playwright.js'

test('dist/strata.html opens with the starter library and no errors', async ({
  page,
  mode,
  urlFor,
}) => {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto(urlFor('dist/strata.html'))
  await page.waitForFunction(() => /** @type {any} */ (window).strataApp?.shell?.canvas?.graph)
  const state = await page.evaluate(() => {
    const strata = /** @type {any} */ (window).strata
    return {
      protocol: location.protocol,
      bundles: strata.components
        .list({ kind: 'component' })
        .filter((/** @type {any} */ c) => c.source === 'bundle').length,
      connectionTypes: strata.components.connectionTypes().length,
    }
  })
  expect(state).toEqual({
    protocol: mode === 'file' ? 'file:' : 'http:',
    bundles: 19,
    connectionTypes: 6,
  })
  await expect(page.locator('strata-library button', { hasText: 'Relational DB' })).toHaveCount(1)
  expect(errors).toEqual([])
})
