// @ts-check
// strata-graph under the CSP of eng §16 (task 0309): a diagram, its overlays, both themes, the
// minimap and an export draw with no violation of a policy that allows no inline styles. Its
// visual snapshots, taken under the same policy, stay as they were.
import { test, expect } from '../../../tools/testing/playwright.js'
import { RECORD_VIOLATIONS, strictCsp } from '../../../tools/testing/csp.js'

test('strata-graph draws under the CSP of eng §16 with no violation', async ({ page }) => {
  await page.addInitScript(RECORD_VIOLATIONS)
  const response = await page.goto('/packages/graph/test/browser/harness.html')
  expect(response?.headers()['content-security-policy']).toBe(strictCsp())
  await page.waitForFunction(() => /** @type {any} */ (window).harnessReady === true)
  const result = await page.evaluate(() => {
    const w = /** @type {any} */ (window)
    w.makeGraph({ theme: 'light' })
    w.g.setOverlay('heatmap', { values: { svc: 0.97 }, domain: [0, 1] })
    w.g.setOverlay('scope', { ids: ['svc'] })
    w.g.setTheme('dark')
    w.g.setTransform({ x: 0, y: 0, k: 0.1 })
    const map = w.strataGraph.createMinimap(w.g, document.body)
    const svg = w.g.exportSVG()
    map.destroy?.()
    return {
      drawn: document.querySelectorAll('#host .sg-node').length > 0,
      exported: svg.includes('<style'),
      violations: w.cspViolations,
    }
  })
  expect(result).toEqual({ drawn: true, exported: true, violations: [] })
})
