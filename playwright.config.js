// @ts-check
// Browser tests (eng §18): every spec runs in Chromium, Firefox and WebKit. End-to-end specs in
// tests/e2e run twice per browser, from the local server and from file://; component specs
// need the element harness, which loads modules, so they run served only.
//
// STRATA_BROWSERS=chromium limits a local run to the browsers you have installed; CI runs all.
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.STRATA_TEST_PORT ?? 4174)
const DEVICES = /** @type {const} */ ({
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
})
const E2E = ['tests/e2e/**/*.spec.js']
const SERVED = [
  ...E2E,
  'tools/testing/browser/**/*.spec.js',
  'packages/*/test/components/**/*.spec.js',
  'packages/*/test/*.spec.js',
]

/** @typedef {keyof typeof DEVICES} BrowserName */

/**
 * The browsers named in STRATA_BROWSERS (comma-separated), or all three.
 * @param {string} [list]
 * @returns {BrowserName[]}
 */
export function selectBrowsers(list) {
  const all = /** @type {BrowserName[]} */ (Object.keys(DEVICES))
  if (!list?.trim()) return all
  const names = list.split(',').map(name => name.trim())
  for (const name of names)
    if (!(name in DEVICES))
      throw new Error(`STRATA_BROWSERS: unknown browser '${name}' (use ${all.join(', ')})`)
  return /** @type {BrowserName[]} */ (names)
}

/**
 * Two projects per browser: served, and file:// for the end-to-end specs.
 * @param {BrowserName[]} [browsers]
 */
export function browserProjects(browsers = selectBrowsers()) {
  return browsers.flatMap(browserName => {
    const use = { ...DEVICES[browserName], browserName }
    return [
      { name: `${browserName}-served`, testMatch: SERVED, use: { ...use, mode: 'served' } },
      { name: `${browserName}-file`, testMatch: E2E, use: { ...use, mode: 'file' } },
    ]
  })
}

export default defineConfig({
  testDir: '.',
  testMatch: SERVED,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  outputDir: 'test-results',
  globalSetup: './tests/e2e/global-setup.js',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: browserProjects(selectBrowsers(process.env.STRATA_BROWSERS)),
  webServer: {
    command: `node scripts/dev-server.js --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
})
