// @ts-check
// The app under the CSP of eng §16 (task 0309): served by strata serve, it starts, draws its
// sample project and breaks no rule of the policy, which allows no inline styles.
import { test, expect } from '../../../tools/testing/playwright.js'
import { RECORD_VIOLATIONS, strictCsp } from '../../../tools/testing/csp.js'

for (const path of ['/app/', '/dist/strata.html'])
  test(`${path} runs under the CSP of eng §16 with no violation`, async ({ page }) => {
    await page.addInitScript(RECORD_VIOLATIONS)
    const response = await page.goto(path)
    expect(response?.headers()['content-security-policy']).toBe(strictCsp())
    await page.waitForFunction(() => /** @type {any} */ (window).strataApp?.shell?.canvas?.graph)
    const state = await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      return {
        nodes: w.strata.project.root.nodes().length > 0,
        drawn: w.strataApp.shell.canvas.graph.stats.nodes > 0,
        violations: w.cspViolations,
      }
    })
    expect(state).toEqual({ nodes: true, drawn: true, violations: [] })
  })
