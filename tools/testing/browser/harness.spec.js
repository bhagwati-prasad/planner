// @ts-check
// The element harness (task 0007): component tests mount one custom element in isolation.
import { test, expect } from '../playwright.js'

const COUNTER = '/tools/testing/browser/fixtures/test-counter.js'

test('mounts one custom element with its attributes and properties', async ({ mount, page }) => {
  const counter = await mount('test-counter', {
    module: COUNTER,
    attributes: { label: 'Clicks' },
    properties: { count: 2 },
  })
  await expect(counter).toHaveText('Clicks: 2')
  await counter.getByRole('button').click()
  await expect(counter).toHaveText('Clicks: 3')
  await expect(page.locator('#host > *')).toHaveCount(1)
})

test('fails clearly when the module does not define the element', async ({ mount }) => {
  await expect(mount('test-missing', { module: COUNTER })).rejects.toThrow(
    /test-missing is not defined by \/tools\/testing\/browser\/fixtures\/test-counter\.js/
  )
})

test('loads IBM Plex from its bytes, not through a stylesheet font', async ({ page }) => {
  await page.goto('/tools/testing/browser/harness.html')
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  const fonts = await page.evaluate(() => ({
    rules: [...document.styleSheets]
      .flatMap(sheet => [...sheet.cssRules])
      .filter(rule => rule instanceof CSSFontFaceRule).length,
    loaded: [...document.fonts].filter(face => face.status === 'loaded').length,
  }))
  expect(fonts).toEqual({ rules: 0, loaded: 3 })
})
