// @ts-check
// The strata ESLint plugin: rules for the non-negotiables (eng §2) and the lint-marked rules of
// the engineering guidelines. See README.md.
import { rule as bannedGlobals } from './rules/banned-globals.js'
import { rule as facadeHelp } from './rules/facade-help.js'
import { rule as importBoundaries } from './rules/import-boundaries.js'
import { rule as noColourLiterals } from './rules/no-colour-literals.js'
import { rule as noDynamicHtml } from './rules/no-dynamic-html.js'
import { rule as noFloatingPromises } from './rules/no-floating-promises.js'
import { rule as noOnly } from './rules/no-only.js'
import { processor as css } from './processors/css.js'

export const plugin = {
  meta: { name: 'strata', version: '0.1.0' },
  rules: {
    'banned-globals': bannedGlobals,
    'facade-help': facadeHelp,
    'import-boundaries': importBoundaries,
    'no-colour-literals': noColourLiterals,
    'no-dynamic-html': noDynamicHtml,
    'no-floating-promises': noFloatingPromises,
    'no-only': noOnly,
  },
  processors: { css },
}
