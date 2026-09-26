import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenize } from '../src/tokenize.js'
import { transformModule, ModuleError } from '../src/modules.js'
import { bundleModules, emitScript, formatProblem } from '../src/bundle.js'
import { minify } from '../src/minify.js'
import { loadModules } from './fixtures.js'

const repo = fileURLToPath(new URL('../../..', import.meta.url))

/** Bundles `files` from `entry` and loads it; throws on bundling errors. */
function run(files, entry = 'main.js') {
  const b = bundleModules(files, [entry])
  const errors = b.problems.filter(p => p.level === 'error')
  if (errors.length) throw new Error(errors.map(formatProblem).join('\n'))
  return loadModules(
    Object.fromEntries(Object.entries(b.modules).map(([p, m]) => [p, m.code])),
    entry
  )
}

const errorsOf = (files, entry = 'main.js') =>
  bundleModules(files, [entry])
    .problems.filter(p => p.level === 'error')
    .map(formatProblem)

test('named, default, namespace and aliased imports', () => {
  const ns = run({
    'main.js': `import def, { a, b as bee } from './lib/x.js'
import * as all from './lib/x.js'
export const result = [def(), a, bee, all.a, Object.keys(all).sort().join()]`,
    'lib/x.js': `export const a = 1
export let b = 2
export default function () { return 'def' }`,
  })
  assert.deepEqual(ns.result, ['def', 1, 2, 1, 'a,b,default'])
  assert.equal(Object.prototype.toString.call(ns), '[object Module]')
  assert.throws(
    () => {
      ns.extra = 1
    },
    TypeError,
    'namespaces are not extensible'
  )
})

test('every export form', () => {
  const ns = run({
    'main.js': `export { x, y as why } from './lib/a.js'
export * from './lib/b.js'
export * as c from './lib/c.js'
export function fn () { return 'fn' }
export async function afn () { return 'afn' }
export function * gen () { yield 1 }
export class K { static id = 'K' }
export const one = 1, two = 2
export const { p, q: renamed, ...rest } = { p: 'p', q: 'q', r: 'r' }
export const [first, , third = 3, ...others] = ['f', 'skip', undefined, 'o']
const local = 'local'
export { local as aliased, local }
export default class extends K {}`,
    'lib/a.js': 'export const x = "x"\nexport const y = "y"',
    'lib/b.js': 'export const fromB = "b"\nexport default "b-default"',
    'lib/c.js': 'export const inC = "c"',
  })
  assert.deepEqual(
    [
      ns.x,
      ns.why,
      ns.fromB,
      ns.c.inC,
      ns.fn(),
      ns.gen().next().value,
      ns.K.id,
      ns.one,
      ns.two,
      ns.p,
      ns.renamed,
      ns.rest,
      ns.first,
      ns.third,
      ns.others,
      ns.aliased,
      ns.local,
    ],
    ['x', 'y', 'b', 'c', 'fn', 1, 'K', 1, 2, 'p', 'q', { r: 'r' }, 'f', 3, ['o'], 'local', 'local']
  )
  assert.equal(Object.getPrototypeOf(ns.default), ns.K, 'anonymous default class')
  assert.ok(!('default' in ns && ns.default === 'b-default'), 'export * skips default')
})

test('default exports: expressions, named functions and anonymous functions', () => {
  assert.equal(run({ 'main.js': 'export default 6 * 7' }).default, 42)
  assert.equal(
    run({ 'main.js': 'export default function named () { return named.name }' }).default(),
    'named'
  )
  assert.equal(
    run({ 'main.js': 'export default async function () {}' }).default.constructor.name,
    'AsyncFunction'
  )
  assert.equal(run({ 'main.js': 'const v = { k: 1 }\nexport { v as default }' }).default.k, 1)
})

test('module syntax inside strings, comments, templates, regexes and object keys is left alone', () => {
  const ns = run({
    'main.js': `// import nope from './nope.js'
/* export const hidden = 1 */
const s = "import x from './nope.js'"
const t = \`export \${'}'} \${ \`import \${"'"}\` } done\`
const re = /['"\\/]import/g
const half = 10 / 2 / 5
const o = { import: 1, export: 2, default: 3 }
class C { import () { return 'method' } static export () { return 'static' } }
const call = o.import + o.export
export const out = [s, t, re.source, half, call, new C().import(), C.export()]`,
  })
  assert.deepEqual(ns.out, [
    "import x from './nope.js'",
    "export } import ' done",
    '[\'"\\/]import',
    1,
    3,
    'method',
    'static',
  ])
})

test('dynamic import, import.meta and JSON modules', async () => {
  const ns = run({
    'main.js': `import data from './data.json' with { type: 'json' }
export const url = import.meta.url
export const value = data.nested.value
export const later = () => import('./lazy.js')`,
    'data.json': '{ "nested": { "value": 7 } }',
    'lazy.js': 'export const lazy = "loaded"',
  })
  assert.equal(ns.url, 'main.js')
  assert.equal(ns.value, 7)
  assert.equal((await ns.later()).lazy, 'loaded')
})

test('line numbers survive the transform', () => {
  const source = `import { a } from './a.js'
import {
  b,
  c
} from './b.js'
export const x = a

export function f () {
  throw new Error('boom')
}`
  const { code } = transformModule(source)
  const lines = code.split('\n')
  assert.equal(lines.length, source.split('\n').length + 1, 'one extra line: the closing brace')
  assert.match(lines[8], /throw new Error\('boom'\)/)
  assert.match(lines[5], /const x = a/)
  assert.doesNotMatch(lines[5], /export/)
})

test('problems name the file, the line and what to do', () => {
  assert.match(
    errorsOf({ 'main.js': "import { x } from './lib/x'", 'lib/x.js': 'export const x = 1' })[0],
    /main\.js:1: error: imports 'lib\/x', which does not exist\. Did you mean 'lib\/x\.js'\?/
  )
  assert.match(errorsOf({ 'main.js': "import merge from 'lodash/merge'" })[0], /npm packages/)
  assert.deepEqual(
    errorsOf({ 'main.js': "import * as d3 from 'd3'\nimport * as THREE from 'three'" }),
    [],
    'the vendored libraries (task 0005)'
  )
  assert.match(
    errorsOf({ 'main.js': "import x from 'https://cdn.example/x.js'" })[0],
    /only relative imports/
  )
  assert.match(errorsOf({ 'main.js': "import x from '../outside.js'" })[0], /outside the folder/)
  assert.match(
    errorsOf({
      'main.js': "import { backof } from './b.js'",
      'b.js': 'export function backoff () {}',
    })[0],
    /no export named 'backof'/
  )
  assert.match(
    errorsOf({
      'main.js': "import { Backoff } from './b.js'",
      'b.js': 'export function backoff () {}',
    })[0],
    /Did you mean 'backoff'\?/
  )
  // Cycles behave like native modules where bindings stay live (task 0005): side-effect
  // imports and functions cross them; other bindings are reported.
  assert.deepEqual(
    errorsOf({
      'main.js': "import './a.js'",
      'a.js': "import './b.js'",
      'b.js': "import './a.js'",
    }),
    []
  )
  assert.match(
    errorsOf({
      'main.js': "import './a.js'",
      'a.js': "import { n } from './b.js'\nexport function f () { return n }",
      'b.js': "import { f } from './a.js'\nexport const n = 1",
    })[0],
    /a\.js:1: error: 'n' from '\.\/b\.js' crosses an import cycle \(a\.js, b\.js\)/
  )
  assert.match(errorsOf({ 'main.js': 'const __require = 1' })[0], /reserved/)
  assert.match(errorsOf({ 'main.js': 'await Promise.resolve()' })[0], /Top-level await/)
  assert.match(
    errorsOf({ 'main.js': 'export let n = 0\nexport function inc () { n += 1 }' })[0],
    /main\.js:2: .*'n' is reassigned/
  )
  assert.match(
    errorsOf({ 'main.js': 'const a = 1\nconst s = "open' })[0],
    /main\.js:2: error: Unterminated string/
  )
  assert.match(errorsOf({ 'main.js': 'function f () {\n  return 1\n' })[0], /Unclosed '\{'/)
  assert.match(
    errorsOf({
      'data.json': '{ nope }',
      'main.js': "import d from './data.json' with { type: 'json' }",
    })[0],
    /data\.json: error: Invalid JSON/
  )
  assert.throws(() => transformModule('export = 1'), ModuleError)
})

test('the tokenizer reads every JavaScript file in this repository', () => {
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.') || name === 'vendor') continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.js')) files.push(path)
    }
  }
  walk(repo)
  assert.ok(files.length > 80)
  for (const file of files)
    assert.doesNotThrow(() => tokenize(readFileSync(file, 'utf8')), relative(repo, file))
})

test('minify keeps every token of every file in this repository, and the line breaks that could matter', () => {
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.') || name === 'vendor' || name === 'dist')
        continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path, out)
      else if (name.endsWith('.js')) out.push(path)
    }
    return out
  }
  // Stated independently of the minifier's own tables: a line break can be a semicolon only
  // between a token that can end a statement and one that can start one, or after a
  // restricted production.
  const RESTRICTED = new Set(['return', 'throw', 'break', 'continue', 'yield', 'async'])
  const WORD_OPERATORS = new Set(['in', 'instanceof'])
  const canEnd = t =>
    ['name', 'number', 'string', 'template', 'regex', 'private'].includes(t.type) ||
    [')', ']', '}', '++', '--'].includes(t.value)
  const canStart = (t, prev) =>
    (t.type === 'name' &&
      !WORD_OPERATORS.has(t.value) &&
      !(['else', 'catch', 'finally'].includes(t.value) && /^[};]$/.test(prev.value))) ||
    ['number', 'string', 'template', 'regex', 'private'].includes(t.type) ||
    ['(', '[', '{', '++', '--', '+', '-', '!', '~'].includes(t.value)
  let before = 0
  let after = 0
  for (const file of walk(repo)) {
    const src = readFileSync(file, 'utf8')
    const out = minify(src)
    before += src.length
    after += out.length
    const original = tokenize(src)
    const minified = tokenize(out)
    const name = relative(repo, file)
    assert.deepEqual(
      minified.map(t => t.value),
      original.map(t => t.value),
      `${name}: the same tokens in the same order`
    )
    for (let i = 1; i < original.length; i++) {
      const [prev, t] = [original[i - 1], original[i]]
      const matters = RESTRICTED.has(prev.value) || (canEnd(prev) && canStart(t, prev))
      if (t.nl && matters)
        assert.ok(minified[i].nl, `${name}:${t.line}: the line break before '${t.value}' stays`)
    }
  }
  assert.ok(after < before * 0.7, `minified to ${Math.round((after / before) * 100)}%`)
})

test('the facade bundles into one CommonJS script that works', async () => {
  const files = {}
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.js'))
        files[relative(repo, path).split('\\').join('/')] = readFileSync(path, 'utf8')
    }
  }
  walk(join(repo, 'packages'))
  const entry = 'packages/facade/src/index.js'
  const bundle = bundleModules(files, [entry])
  assert.deepEqual(bundle.problems, [])
  assert.ok(
    bundle.order.indexOf('packages/core/src/errors.js') < bundle.order.indexOf(entry),
    'dependencies come first'
  )
  const script = minify(emitScript(bundle, { entry, format: 'cjs', banner: '/* strata */' }))
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', script)(module)
  const strata = module.exports.createStrata({ clock: () => Date.UTC(2026, 8, 26) })
  const p = await strata.projects.create('bundled')
  const svc = p.root.add('base:service', { name: 'Orders' })
  const db = p.root.add('base:store', { name: 'Orders DB' })
  p.root.connect(svc, db)
  const sub = p.root.extract([svc, db], { name: 'Orders system' })
  assert.equal(p.root.nodes().length, 1)
  assert.equal(sub.nodes().length, 2)
  assert.throws(
    () => p.root.add('nope'),
    err => err.code === 'NOT_FOUND'
  )

  const iife = emitScript(bundle, { entry, format: 'iife', globalName: '__strataTest' })
  // eslint-disable-next-line no-new-func
  new Function(iife)()
  assert.equal(typeof globalThis.__strataTest.createStrata, 'function')
  delete globalThis.__strataTest
})
