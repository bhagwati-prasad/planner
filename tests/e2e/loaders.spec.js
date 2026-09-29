// @ts-check
// Loaders (task 0305, spec §8 "Loading paths"): packed components added by script tags register
// without their behaviour running on the page, and a malformed upload is refused with its reason.
import { test, expect } from '../../tools/testing/playwright.js'

/** @typedef {import('@playwright/test').Page} Page */

/** Opens a page of the offline build and waits for the app. @param {Page} page @param {string} url */
async function openApp(page, url) {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto(url)
  await page.waitForFunction(() => /** @type {any} */ (window).strataApp?.shell?.canvas?.graph)
  return errors
}

test('a page with two component script tags registers both, and no behaviour code runs on the page', async ({
  page,
  urlFor,
}) => {
  const errors = await openApp(page, urlFor('dist/loaders.html'))
  const state = await page.evaluate(() => {
    const w = /** @type {any} */ (window)
    return {
      alpha: w.strata.components.versions('e2e.alpha'),
      beta: w.strata.components.versions('e2e.beta'),
      modules: w.strata.components
        .bundle('e2e.alpha')
        ?.modules['index.js']?.includes('strataBehaviourRanOnPage'),
      ranOnPage: 'strataBehaviourRanOnPage' in w,
    }
  })
  expect(state).toEqual({ alpha: ['1.0.0'], beta: ['1.0.0'], modules: true, ranOnPage: false })
  expect(errors).toEqual([])
})

test('a malformed upload shows the validation error and registers nothing', async ({
  page,
  urlFor,
}) => {
  await openApp(page, urlFor('dist/strata.html'))
  const before = await page.evaluate(
    () => /** @type {any} */ (window).strata.components.list().length
  )
  const manifest = JSON.stringify({
    strataApi: '^1.0',
    id: 'e2e.broken',
    name: 'Broken',
    version: '1.0',
    ports: 'in',
  })
  await page
    .locator('strata-library input[type="file"]')
    .setInputFiles([
      { name: 'manifest.json', mimeType: 'application/json', buffer: Buffer.from(manifest) },
    ])
  const library = page.locator('strata-library')
  await expect(library).toContainText('version must be a semantic version')
  await expect(library).toContainText('ports must be a list')
  const after = await page.evaluate(() => ({
    count: /** @type {any} */ (window).strata.components.list().length,
    broken: /** @type {any} */ (window).strata.components.versions('e2e.broken'),
  }))
  expect(after).toEqual({ count: before, broken: [] })
})
