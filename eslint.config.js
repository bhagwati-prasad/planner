// @ts-check
// Lint rules from eng §4 and §5 (style beyond formatting) and eng §16 (code execution).
// Formatting itself is Prettier's job; the rules for the non-negotiables arrive in task 0003.

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
    // Component behaviour entries (the plugin API requires a default export) and tool configs.
    files: ['components/*/index.js', 'eslint.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]
