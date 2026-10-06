// @ts-check
// The design token generator (task 0501, design system §15): packages/ui/tokens/tokens.json is
// the one source, and the generator writes tokens.css for CSS and src/tokens.js for canvas and
// 3D code. The files in the repository match what it writes, and carry the selectors of design
// system §15. (It lives here, not in strata-ui's tests, since it formats with Prettier.)
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateTokens } from '../generate.js'
import { THEMES } from '../../../packages/ui/src/tokens.js'

const read = (/** @type {string} */ path) =>
  readFileSync(new URL(`../../../packages/ui/${path}`, import.meta.url), 'utf8')

describe('design tokens', () => {
  it('generates tokens.css and tokens.js that match tokens.json', async () => {
    const json = JSON.parse(read('tokens/tokens.json'))
    const { css, js } = await generateTokens(json)
    assert.equal(
      css,
      read('tokens/tokens.css'),
      'tokens.css is up to date: npm run generate:tokens'
    )
    assert.equal(js, read('src/tokens.js'), 'src/tokens.js is up to date: npm run generate:tokens')

    // The selectors of design system §15: a chosen theme, or the system preference.
    for (const selector of [
      ':root {',
      ":root[data-theme='dark'] {",
      '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {',
      ":root[data-theme='contrast'] {",
      "@media (prefers-color-scheme: dark) {\n  :root[data-theme='contrast'] {",
      '@media (prefers-reduced-motion: reduce) {\n  :root {\n    --st-duration-depth: 120ms;',
    ])
      assert.ok(css.includes(selector), `tokens.css has ${selector}`)
    assert.ok(
      css.includes('--st-color-accent: var(--st-lapis-600);'),
      'semantic tokens name primitives'
    )
    assert.equal(THEMES.light['color-accent'], '#3346D3')
    assert.equal(THEMES.dark['color-text-tertiary'], '#8D97A6')
    assert.equal(THEMES['contrast-dark']['color-bg-canvas'], '#0B0D10')
  })
})
