// @ts-check
// Design tokens (task 0501, design system §3): every text pairing meets its contrast target,
// computed from the generated values: 4.5:1 for text and 3:1 for icons, focus rings and control
// outlines in the light and dark themes, and 7:1 for text and 3:1 for every border, dividers
// included, in the contrast themes. tools/tokens/test checks that the files match tokens.json.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES } from '../src/tokens.js'

/** The relative luminance of a #RRGGBB colour (WCAG 2.2). @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The contrast ratio of two colours. @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const BACKGROUNDS = ['color-bg-canvas', 'color-bg-surface', 'color-bg-raised', 'color-bg-subtle']

/**
 * The pairings a theme must meet, as [foreground, background, kind].
 * @param {boolean} high  a contrast theme, whose borders all reach control strength
 */
function pairings(high) {
  /** @type {[string, string, 'text'|'graphic'][]} */
  const out = []
  for (const bg of BACKGROUNDS) {
    for (const fg of [
      'color-text-primary',
      'color-text-secondary',
      'color-text-tertiary',
      'color-accent',
    ])
      out.push([fg, bg, 'text'])
    for (const status of ['success', 'warning', 'danger', 'info'])
      if (bg !== 'color-bg-subtle') out.push([`color-${status}-text`, bg, 'text'])
    out.push(['color-focus', bg, 'graphic'])
  }
  for (const bg of ['color-bg-canvas', 'color-bg-surface'])
    out.push(['color-border-control', bg, 'graphic'], ['color-border-strong', bg, 'graphic'])
  if (high)
    for (const bg of BACKGROUNDS)
      for (const fg of [
        'color-border-subtle',
        'color-border-default',
        'color-border-control',
        'color-border-strong',
      ])
        out.push([fg, bg, 'graphic'])
  out.push(
    ['color-text-on-accent', 'color-accent', 'text'],
    ['color-text-on-accent', 'color-accent-hover', 'text'],
    ['color-text-primary', 'color-accent-subtle', 'text'],
    ['color-accent', 'color-accent-subtle', 'text'],
    ['color-paper-text', 'color-paper-bg', 'text']
  )
  for (const status of ['success', 'warning', 'danger', 'info'])
    out.push([`color-${status}-text`, `color-${status}-bg`, 'text'])
  return out
}

describe('design tokens', () => {
  for (const [theme, high] of [
    ['light', false],
    ['dark', false],
    ['contrast-light', true],
    ['contrast-dark', true],
  ])
    it(`meets every contrast target in the ${theme} theme`, () => {
      const values = /** @type {Record<string, string>} */ (
        THEMES[/** @type {keyof typeof THEMES} */ (theme)]
      )
      const failures = pairings(/** @type {boolean} */ (high)).flatMap(([fg, bg, kind]) => {
        const target = kind === 'text' ? (high ? 7 : 4.5) : 3
        if (!values[fg] || !values[bg]) return [`${fg} on ${bg}: no value`]
        const ratio = contrast(values[fg], values[bg])
        return ratio >= target ? [] : [`${fg} on ${bg}: ${ratio.toFixed(2)}:1, under ${target}:1`]
      })
      assert.deepEqual(failures, [])
    })
})
