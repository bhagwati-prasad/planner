// @ts-check
// Themes and fonts in the offline app (task 0501, design system §15): data-theme switches the
// tokens' computed values at once, with no reload; without one, the system's colour scheme
// applies, and so does reduced motion. The bundled IBM Plex faces load from file:// as well as
// served, and together weigh at most 120 KB (eng §15).
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../../tools/testing/playwright.js'

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))

/**
 * A token's computed value on the root element, colours in upper case as design system §3 writes them.
 * @param {import('@playwright/test').Page} page @param {string} name
 */
const token = (page, name) =>
  page.evaluate(
    n => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(),
    name
  )

/** Sets or clears data-theme on the root element. @param {import('@playwright/test').Page} page @param {string|null} theme */
const choose = (page, theme) =>
  page.evaluate(t => {
    if (t === null) document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', t)
  }, theme)

test('switching data-theme updates the computed tokens without a reload', async ({
  page,
  urlFor,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.goto(urlFor('dist/strata.html'))
  await page.waitForFunction(() => /** @type {any} */ (window).strataApp)
  await page.evaluate(() => {
    ;/** @type {any} */ (window).unloaded = false
  })
  const canvas = () => token(page, '--st-color-bg-canvas')

  expect(await canvas()).toBe('#F3F5F7')
  await choose(page, 'dark')
  expect(await canvas()).toBe('#13161A')
  await choose(page, 'contrast')
  expect(await canvas()).toBe('#FFFFFF')
  await choose(page, 'light')
  expect(await canvas()).toBe('#F3F5F7')

  // No theme chosen: the system's colour scheme decides, for contrast too.
  await choose(page, null)
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await canvas()).toBe('#13161A')
  await choose(page, 'contrast')
  expect(await canvas()).toBe('#0B0D10')
  await choose(page, 'light')
  expect(await canvas(), 'a chosen theme beats the system').toBe('#F3F5F7')

  expect(await token(page, '--st-duration-depth')).toBe('420MS')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await token(page, '--st-duration-depth')).toBe('120MS')
  expect(await page.evaluate(() => /** @type {any} */ (window).unloaded)).toBe(false)
})

test('loads the bundled IBM Plex faces, at most 120 KB together', async ({ page, urlFor }) => {
  await page.goto(urlFor('dist/strata.html'))
  const faces = [
    '400 13px "IBM Plex Sans"',
    '500 13px "IBM Plex Sans"',
    '600 13px "IBM Plex Sans"',
    '400 12px "IBM Plex Mono"',
    '500 12px "IBM Plex Mono"',
  ]
  const loaded = await page.evaluate(
    async list =>
      Promise.all(
        list.map(async font => {
          const found = await document.fonts.load(font)
          return found.length === 1 && found[0].status === 'loaded' ? found[0].weight : null
        })
      ),
    faces
  )
  expect(loaded).toEqual(['400', '500', '600', '400', '500'])

  const fonts = readdirSync(join(DIST, 'fonts')).filter(f => f.endsWith('.woff2'))
  expect(fonts).toHaveLength(5)
  const bytes = fonts.reduce((sum, f) => sum + statSync(join(DIST, 'fonts', f)).size, 0)
  expect(bytes).toBeLessThanOrEqual(120_000)
})
