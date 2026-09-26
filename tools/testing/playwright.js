// @ts-check
// Playwright fixtures for Strata's browser tests (eng §18). Import `test` and `expect` from here
// instead of '@playwright/test':
//
//   mode     'served' or 'file', set by the project (playwright.config.js)
//   urlFor   a repository path as a URL for the project's mode: file:// or the local server
//   mount    loads the element harness and mounts one custom element; resolves to its locator
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test as base, expect } from '@playwright/test'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const HARNESS = '/tools/testing/browser/harness.html'

/**
 * @typedef {object} MountOptions
 * @property {string} [module]                          script that defines the element, from the repository root
 * @property {Record<string, string>} [attributes]
 * @property {Record<string, unknown>} [properties]     JSON-safe values assigned after creation
 *
 * @typedef {object} Fixtures
 * @property {'served'|'file'} mode
 * @property {(path: string) => string} urlFor
 * @property {(tag: string, options?: MountOptions) => Promise<import('@playwright/test').Locator>} mount
 */

/** @type {import('@playwright/test').TestType<import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions & Fixtures, import('@playwright/test').PlaywrightWorkerArgs & import('@playwright/test').PlaywrightWorkerOptions>} */
export const test = base.extend({
  mode: ['served', { option: true }],

  urlFor: async ({ mode, baseURL }, use) => {
    await use(path =>
      mode === 'file'
        ? pathToFileURL(join(ROOT, path)).href
        : new URL(path.replace(/^\//, ''), `${baseURL}/`).href
    )
  },

  mount: async ({ page }, use) => {
    await use(async (tag, { module, attributes = {}, properties = {} } = {}) => {
      await page.goto(HARNESS)
      await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
      await page.evaluate(spec => /** @type {any} */ (window).mount(spec), {
        tag,
        module,
        attributes,
        properties,
      })
      return page.locator(`#host > ${tag}`)
    })
  },
})

export { expect }
