// @ts-check
// Every strata lint rule, with valid and invalid cases, through ESLint's RuleTester (task 0003).
import { describe, it } from 'node:test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuleTester } from 'eslint'
import { plugin } from '../index.js'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
/** An absolute path in the repository. @param {string} path */
const at = path => join(ROOT, path)
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } })
const rules = plugin.rules

tester.run('import-boundaries', rules['import-boundaries'], {
  valid: [
    {
      filename: at('packages/facade/src/strata.js'),
      code: "import { createCore } from '../../core/src/index.js'",
    },
    { filename: at('packages/core/src/bus.js'), code: "import { fail } from './errors.js'" },
    {
      filename: at('packages/ui/src/adapter.js'),
      code: "export { create } from '../../graph/src/index.js'",
    },
    { filename: at('packages/graph/src/dom/graph.js'), code: "import * as d3 from 'd3'" },
    {
      filename: at('packages/server/src/server.js'),
      code: "import { createServer } from 'node:http'",
    },
    {
      filename: at('packages/core/test/bus.test.js'),
      code: "import { it } from 'node:test'\nimport x from '../../plugins/test/fixtures.js'",
    },
    {
      filename: at('scripts/build.js'),
      code: "import { minify } from '../packages/plugins/src/minify.js'",
    },
  ],
  invalid: [
    {
      filename: at('packages/ui/src/adapter.js'),
      code: "import { createCore } from '../../core/src/model.js'",
      errors: [{ messageId: 'notAllowed' }],
    },
    {
      filename: at('packages/facade/src/strata.js'),
      code: "import { fail } from '../../core/src/errors.js'",
      errors: [{ messageId: 'notIndex' }],
    },
    {
      filename: at('packages/core/src/bus.js'),
      code: "import { plugin } from '../../plugins/src/index.js'",
      errors: [{ messageId: 'notAllowed' }],
    },
    {
      filename: at('packages/graph/src/data.js'),
      code: "import { createStrata } from '../../facade/src/index.js'",
      errors: [{ messageId: 'notAllowed' }],
    },
    {
      filename: at('packages/core/src/bus.js'),
      code: "import lodash from 'lodash'",
      errors: [{ messageId: 'bare' }],
    },
    {
      filename: at('packages/core/src/bus.js'),
      code: "import { readFile } from 'node:fs'",
      errors: [{ messageId: 'bare' }],
    },
    {
      filename: at('packages/ui/src/elements/app.js'),
      code: "export * from '../../../facade/src/strata.js'",
      errors: [{ messageId: 'notIndex' }],
    },
    {
      filename: at('packages/ui/src/adapter.js'),
      code: "const m = import('../../core/src/index.js')",
      errors: [{ messageId: 'notAllowed' }],
    },
  ],
})

tester.run('banned-globals', rules['banned-globals'], {
  valid: [
    {
      filename: at('packages/ui/src/elements/canvas.js'),
      code: 'const x = Math.random() + Date.now()\nwindow.scrollTo(0, 0)',
    },
    {
      filename: at('packages/sim/src/kernel.js'),
      code: 'export function next (random) { return random() }',
    },
    {
      filename: at('packages/core/src/ids.js'),
      code: 'const window = 3\nexport const size = window * 2',
    },
    {
      filename: at('packages/core/src/time.js'),
      code: 'export const at = ms => new Date(ms).toISOString()',
    },
    {
      filename: at('packages/core/src/obj.js'),
      code: 'export const f = o => o.console + o.document',
    },
    { filename: at('packages/cli/src/cli.js'), code: 'console.log(Date.now())' },
  ],
  invalid: [
    {
      filename: at('packages/sim/src/kernel.js'),
      code: 'export const pick = () => Math.random()',
      errors: [{ messageId: 'banned', data: { name: 'Math.random', pkg: 'sim' } }],
    },
    {
      filename: at('packages/core/src/bus.js'),
      code: 'const t = Date.now()',
      errors: [{ messageId: 'banned', data: { name: 'Date.now', pkg: 'core' } }],
    },
    {
      filename: at('packages/core/src/bus.js'),
      code: 'const t = new Date()',
      errors: [{ messageId: 'banned', data: { name: 'new Date()', pkg: 'core' } }],
    },
    {
      filename: at('packages/facade/src/strata.js'),
      code: "console.log('hi')",
      errors: [{ messageId: 'banned', data: { name: 'console', pkg: 'facade' } }],
    },
    {
      filename: at('packages/test/src/runner.js'),
      code: 'setTimeout(run, 10)',
      errors: [{ messageId: 'banned', data: { name: 'setTimeout', pkg: 'test' } }],
    },
    {
      filename: at('packages/docs/src/render.js'),
      code: 'const el = document.body',
      errors: [{ messageId: 'banned', data: { name: 'document', pkg: 'docs' } }],
    },
    {
      filename: at('packages/plan/src/x.js'),
      code: 'const t = performance.now()',
      errors: [{ messageId: 'banned', data: { name: 'performance.now', pkg: 'plan' } }],
    },
    {
      filename: at('packages/comments/src/x.js'),
      code: "fetch('/api')",
      errors: [{ messageId: 'banned', data: { name: 'fetch', pkg: 'comments' } }],
    },
  ],
})

tester.run('no-dynamic-html', rules['no-dynamic-html'], {
  valid: [
    { code: "el.innerHTML = '<b>static</b>'" },
    { code: 'el.innerHTML = `<p>static template</p>`' },
    { code: 'el.innerHTML = sanitizeMarkdown(text)' },
    { code: 'el.textContent = name' },
    { code: "el.insertAdjacentHTML('beforeend', '<hr>')" },
  ],
  invalid: [
    { code: 'el.innerHTML = name', errors: [{ messageId: 'dynamic' }] },
    { code: 'el.innerHTML = `<b>${name}</b>`', errors: [{ messageId: 'dynamic' }] },
    { code: "el.outerHTML = '<p>' + text + '</p>'", errors: [{ messageId: 'dynamic' }] },
    { code: "el.insertAdjacentHTML('beforeend', html)", errors: [{ messageId: 'dynamic' }] },
    { code: 'el.innerHTML += more', errors: [{ messageId: 'dynamic' }] },
  ],
})

const css = (/** @type {string} */ body) => `export const css = String.raw\`${body}\``

tester.run('no-colour-literals', rules['no-colour-literals'], {
  valid: [
    {
      filename: at('packages/ui/src/elements/panel.css'),
      code: css('.a { color: var(--st-color-text-primary); background: transparent; }'),
    },
    {
      filename: at('packages/ui/src/elements/tokens.css'),
      code: css(':root { --st-color-accent: #2563eb; --st-shadow: rgba(0, 0, 0, 0.2); }'),
    },
    {
      filename: at('packages/ui/src/elements/panel.js'),
      code: 'class P { static css = `.a { color: var(--st-text); border-color: currentColor; }` }',
    },
    {
      filename: at('packages/ui/src/elements/panel.js'),
      code: "const label = 'red'\nconst id = '#fff'",
    },
    {
      filename: at('packages/ui/src/elements/panel.css'),
      code: css('.a { white-space: nowrap; font-family: "IBM Plex Sans"; transition: fill 0.2s; }'),
    },
  ],
  invalid: [
    {
      filename: at('packages/ui/src/elements/panel.css'),
      code: css('.a { color: #fff; }'),
      errors: [{ messageId: 'literal', data: { value: '#fff' } }],
    },
    {
      filename: at('packages/ui/src/elements/panel.css'),
      code: css('.a {\n  background: rgba(0, 0, 0, 0.25);\n}'),
      errors: [{ messageId: 'literal', data: { value: 'rgba(' }, line: 2 }],
    },
    {
      filename: at('packages/ui/src/elements/panel.css'),
      code: css('.a { border: 1px solid red; }'),
      errors: [{ messageId: 'literal', data: { value: 'red' } }],
    },
    {
      filename: at('packages/ui/src/elements/panel.js'),
      code: 'class P { static css = `.a { color: hsl(10 50% 50%); }` }',
      errors: [{ messageId: 'literal', data: { value: 'hsl(' } }],
    },
  ],
})

tester.run('no-floating-promises', rules['no-floating-promises'], {
  valid: [
    { code: 'async function load () {}\nexport async function run () { await load() }' },
    { code: 'async function load () {}\nexport function run () { return load() }' },
    { code: 'async function load () {}\nexport function run () { void load() }' },
    { code: 'async function load () {}\nexport function run () { load().catch(report) }' },
    { code: 'export function run (p) { p.then(done, fail) }' },
    { code: 'export function run (p) { p.then(done).catch(fail) }' },
    { code: 'export const x = fetchIt().then(y => y)' },
    { code: 'class A { async #save () {} run () { this.#save().catch(report) } }' },
    { code: 'function sync () {}\nsync()' },
  ],
  invalid: [
    {
      code: 'async function load () {}\nexport function run () { load() }',
      errors: [{ messageId: 'floating' }],
    },
    { code: 'const load = async () => {}\nload()', errors: [{ messageId: 'floating' }] },
    {
      code: 'class A { async #save () {} run () { this.#save() } }',
      errors: [{ messageId: 'floating' }],
    },
    {
      code: 'class A { async save () {} run () { this.save() } }',
      errors: [{ messageId: 'floating' }],
    },
    { code: 'export function run (p) { p.then(done) }', errors: [{ messageId: 'floating' }] },
    {
      code: 'export function run () { new Promise(resolve => resolve()) }',
      errors: [{ messageId: 'floating' }],
    },
  ],
})

tester.run('no-only', rules['no-only'], {
  valid: [
    { code: "it('works', () => {})" },
    { code: "describe('suite', () => { test('x', () => {}) })" },
    { code: "test('x', { skip: false }, () => {})" },
    { code: 'const only = true' },
  ],
  invalid: [
    { code: "it.only('works', () => {})", errors: [{ messageId: 'only' }] },
    { code: "describe.only('suite', () => {})", errors: [{ messageId: 'only' }] },
    { code: "test.only('x', () => {})", errors: [{ messageId: 'only' }] },
    { code: "test('x', { only: true }, () => {})", errors: [{ messageId: 'only' }] },
  ],
})

tester.run('facade-help', rules['facade-help'], {
  valid: [
    {
      filename: at('packages/facade/src/projects.js'),
      code: `export class ProjectsApi {
  /**
   * Opens a saved project.
   * @param {string} name
   * @example await strata.projects.open('checkout')
   */
  open (name) {}
  #secret () {}
  get active () { return null }
  /** @internal */
  _detach () {}
}`,
    },
    {
      filename: at('packages/facade/src/strata.js'),
      code: '/**\n * Creates the facade.\n * @example const strata = createStrata()\n */\nexport function createStrata () {}',
    },
    { filename: at('packages/core/src/bus.js'), code: 'export class Bus { dispatch () {} }' },
    {
      filename: at('packages/facade/src/internal.js'),
      code: 'class Hidden { run () {} }\nfunction helper () {}',
    },
  ],
  invalid: [
    {
      filename: at('packages/facade/src/projects.js'),
      code: 'export class ProjectsApi {\n  open (name) {}\n}',
      errors: [{ messageId: 'missing', data: { name: 'ProjectsApi.open' } }],
    },
    {
      filename: at('packages/facade/src/projects.js'),
      code: 'export class ProjectsApi {\n  /** Opens a project. */\n  open (name) {}\n}',
      errors: [{ messageId: 'noExample', data: { name: 'ProjectsApi.open' } }],
    },
    {
      filename: at('packages/facade/src/strata.js'),
      code: '/** @example createStrata() */\nexport function createStrata () {}',
      errors: [{ messageId: 'noSummary', data: { name: 'createStrata' } }],
    },
  ],
})
