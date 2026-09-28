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

  // In CI, Firefox sometimes never reports a served page's load event, so page.goto times out on
  // pages no change touched (#15, #17, #18). Navigations wait for the document to commit and then
  // for the page itself to say it has loaded. A page that really stalls still fails, and the
  // error names the resources it started, so the CI log shows what stalled.
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    const patched = /** @type {any} */ (page)
    patched.goto = async (
      /** @type {string} */ url,
      /** @type {{ timeout?: number }} */ options = {}
    ) => {
      const response = await goto(url, { ...options, waitUntil: 'commit' })
      await page
        .waitForFunction(() => document.readyState === 'complete', null, {
          timeout: options.timeout,
        })
        .catch(async err => {
          const state = await page
            .evaluate(() => ({
              readyState: document.readyState,
              resources: performance.getEntriesByType('resource').map(r => r.name),
            }))
            .catch(() => null)
          throw new Error(`${url} did not finish loading: ${JSON.stringify(state)}\n${err.message}`)
        })
      return response
    }
    await use(page)
  },

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
