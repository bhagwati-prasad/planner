// @ts-check
// Lint rules from eng §4 and §5 (style beyond formatting), eng §16 (code execution) and the
// lint-marked rules of the guidelines, including the non-negotiables of eng §2 (tools/lint).
// Formatting itself is Prettier's job.
import { plugin as strata } from './tools/lint/index.js'

const NAMED_EXPORTS_ONLY = {
  selector: 'ExportDefaultDeclaration',
  message: 'Use named exports (eng §4). A component behaviour entry is the only default export.',
}

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'vendor/',
      '**/*.strata.js',
      // Fixtures that must fail these rules (tools/test/tooling.test.js).
      'tools/test/fixtures/',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // eng §5 Variables
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // eng §5 Functions and Files (warnings: they are aims, not limits)
      complexity: ['warn', 10],
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      // eng §4 Exports
      'no-restricted-syntax': ['error', NAMED_EXPORTS_ONLY],
      // eng §16 Code execution
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // Component behaviour entries (the plugin API requires a default export), tool configs and
    // Playwright's global setup (both read a default export), and test fixtures that stand in
    // for any code a user might bundle.
    files: [
      'components/*/index.js',
      'eslint.config.js',
      'playwright.config.js',
      'tests/e2e/global-setup.js',
      '**/test/fixtures/**/*.js',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    plugins: { strata },
    rules: {
      // eng §2, §4, §6: dependency table, index-only imports, banned globals in headless code
      'strata/import-boundaries': 'error',
      'strata/banned-globals': 'error',
      // eng §11: no dynamic innerHTML
      'strata/no-dynamic-html': 'error',
      // eng §14: no floating promises
      'strata/no-floating-promises': 'error',
      // eng §20: help metadata on facade methods
      'strata/facade-help': 'error',
      // CLAUDE.md: no committed .only
      'strata/no-only': 'error',
    },
  },
  {
    // eng §14: library code logs only through the injected logger. The CLI owns stdout.
    files: ['packages/*/src/**/*.js'],
    ignores: ['packages/cli/**'],
    rules: { 'no-console': 'error' },
  },
  {
    // eng §11: component CSS uses semantic tokens only.
    files: ['packages/ui/**/*.js', 'components/**/*.js'],
    rules: { 'strata/no-colour-literals': 'error' },
  },
  {
    // .css files reach the rules through a processor that wraps them as JavaScript.
    files: ['**/*.css'],
    plugins: { strata },
    processor: 'strata/css',
  },
  {
    files: ['**/*.css/*.js'],
    rules: { 'strata/no-colour-literals': 'error' },
  },
  {
    // eng §16: the sandbox worker bootstrap is the one place that may evaluate code.
    files: ['packages/sim/src/worker/bootstrap.js'],
    rules: { 'no-eval': 'off', 'no-new-func': 'off', 'no-implied-eval': 'off' },
  },
]
