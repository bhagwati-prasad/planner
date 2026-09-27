// @ts-check
// Visual snapshots need the same text on every machine (task 0210): the strata-graph test
// harness loads IBM Plex from vendor/plex before any test starts.
import { test, expect } from '../../../tools/testing/playwright.js'

test('the strata-graph test harness renders text in IBM Plex Sans from vendor/plex', async ({
  page,
}) => {
  await page.goto('/packages/graph/test/browser/harness.html')
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  const loaded = await page.evaluate(() =>
    [...document.fonts]
      .filter(face => face.status === 'loaded')
      .map(face => `${face.family.replace(/["']/g, '')} ${face.weight}`)
      .sort()
  )
  expect(loaded).toEqual(['IBM Plex Mono 400', 'IBM Plex Sans 400', 'IBM Plex Sans 600'])
})
