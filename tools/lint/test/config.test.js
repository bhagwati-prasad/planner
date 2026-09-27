// @ts-check
// The strata rules as the repository's eslint.config.js applies them (task 0003).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const eslint = new ESLint({ cwd: ROOT })

/**
 * Lints source text as if it were the file at `path`, returning the rule ids it breaks.
 * @param {string} code
 * @param {string} path
 */
async function ruleIds(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, path) })
  return result.messages.map(m => m.ruleId ?? m.message)
}

describe('eslint.config.js', () => {
  it('fails an import of core internals from ui and passes the core index from facade', async () => {
    assert.deepEqual(
      await ruleIds(
        "import { resolve } from '../../core/src/model/resolver.js'\nexport { resolve }\n",
        'packages/ui/src/adapter.js'
      ),
      ['strata/import-boundaries']
    )
    assert.deepEqual(
      await ruleIds(
        "import { createCore } from '../../core/src/index.js'\nexport { createCore }\n",
        'packages/facade/src/strata.js'
      ),
      []
    )
  })

  it('fails Math.random in packages/sim and passes it in packages/ui', async () => {
    assert.deepEqual(
      await ruleIds('export const pick = () => Math.random()\n', 'packages/sim/src/kernel.js'),
      ['strata/banned-globals']
    )
    assert.deepEqual(
      await ruleIds(
        'export const pick = () => Math.random()\n',
        'packages/ui/src/elements/canvas.js'
      ),
      []
    )
  })

  it('fails a hex colour in a component .css file', async () => {
    assert.deepEqual(
      await ruleIds('.panel {\n  color: #1c1917;\n}\n', 'packages/ui/src/elements/panel.css'),
      ['strata/no-colour-literals']
    )
    assert.deepEqual(
      await ruleIds(
        '.panel {\n  color: var(--st-color-text-primary);\n}\n',
        'packages/ui/src/elements/panel.css'
      ),
      []
    )
  })

  it('fails it.only', async () => {
    assert.deepEqual(
      await ruleIds(
        "import { it } from 'node:test'\nit.only('works', () => {})\n",
        'packages/core/test/bus.test.js'
      ),
      ['strata/no-only']
    )
  })

  it('fails eval and new Function outside the sandbox bootstrap', async () => {
    assert.deepEqual(
      await ruleIds("export const f = new Function('return 1')\n", 'packages/core/src/bus.js'),
      ['no-new-func']
    )
    assert.deepEqual(
      await ruleIds(
        "export const f = new Function('return 1')\n",
        'packages/sim/src/worker/bootstrap.js'
      ),
      []
    )
  })

  it('fails console in library code but not in the CLI', async () => {
    assert.deepEqual(
      await ruleIds(
        "export function f() {\n  console.warn('x')\n}\n",
        'packages/plugins/src/pack.js'
      ),
      ['no-console']
    )
    assert.deepEqual(
      await ruleIds("export function f() {\n  console.warn('x')\n}\n", 'packages/cli/src/cli.js'),
      []
    )
  })
})

describe('eslint-suppressions.json', () => {
  it('holds only the debt that task 0120 (help metadata) removes', async () => {
    const { readFileSync } = await import('node:fs')
    const suppressions = JSON.parse(readFileSync(join(ROOT, 'eslint-suppressions.json'), 'utf8'))
    const owned = { 'strata/facade-help': '0120' }
    for (const [file, rules] of Object.entries(suppressions)) {
      assert.match(file, /^packages\/facade\/src\//, `${file} may not suppress anything`)
      for (const rule of Object.keys(rules))
        assert.ok(rule in owned, `${file}: ${rule} is not owned by a later task`)
    }
  })
})
