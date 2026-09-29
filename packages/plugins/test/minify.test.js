// @ts-check
// The minifier drops line breaks and spaces only where the program cannot notice: every token
// stays, in order, and a line break stays wherever automatic semicolon insertion or a
// restricted production (return, throw, break, continue, yield, postfix ++ and --) could
// depend on it. Each case runs before and after minifying and must give the same result.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Script, createContext } from 'node:vm'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { minify } from '../src/minify.js'
import { renameLocals } from '../src/rename.js'
import { tokenize } from '../src/tokenize.js'
import { bundleModules, emitScript } from '../src/bundle.js'
import { findTestFiles } from '../../../scripts/run-tests.js'

const repo = fileURLToPath(new URL('../../..', import.meta.url))

/** Every .js file under `dir`, recursively. @param {string} dir @param {string[]} [out] */
function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) jsFiles(path, out)
    else if (name.endsWith('.js')) out.push(path)
  }
  return out
}

/** Runs a script body in a fresh context and returns the value of `result`. @param {string} code */
function run(code) {
  const context = createContext({})
  new Script(`'use strict';\n${code}\n;globalThis.__result = result`).runInContext(context)
  return JSON.stringify(context.__result)
}

/** @param {string} code */
const same = code => {
  const out = minify(code)
  assert.equal(run(out), run(code), `minified:\n${out}`)
  assert.deepEqual(
    tokenize(out).map(t => t.value),
    tokenize(code).map(t => t.value),
    'the same tokens in the same order'
  )
  return out
}

describe('minify', () => {
  it('keeps the line breaks that automatic semicolon insertion needs', () => {
    same('let a = 1\nlet b = 2\nconst result = [a, b]')
    same('let a = 1\nlet b = a\n;[a, b] = [b, 3]\nconst result = [a, b]')
    same('let x = 0\nlet y = 5\nx = y\nx++\nconst result = x')
    same('let i = 1\nlet j = 2\ni\n++j\nconst result = [i, j]')
    same('function f() {\n  return\n  42\n}\nconst result = f()')
    same('function g() {\n  for (;;) {\n    break\n  }\n  return 1\n}\nconst result = g()')
    same('function* h() {\n  yield\n  1\n}\nconst result = [...h()]')
    same('let r = 0\nif (r) r = 1\nelse r = 2\nconst result = r')
    same('let s = 0\ntry { s = 1 }\ncatch { s = 2 }\nfinally { s += 10 }\nconst result = s')
  })

  it('removes the line breaks and spaces nothing depends on', () => {
    const out = same(
      'const result = [\n  1,\n  2,\n].map(n =>\n  n * 2\n)\n  .filter(n => n > 2)\n  .join(\n    ", "\n  )'
    )
    assert.equal(out, 'const result=[1,2,].map(n=>n*2).filter(n=>n>2).join(", ")\n')
    assert.equal(minify('if (a) {\n  b()\n}\nelse c()\n'), 'if(a){b()}else c()\n')
  })

  it('keeps the spaces that stop tokens from merging', () => {
    same('let a = 1\nconst result = a + +a - -a')
    same('const result = 1 .toString() + 2 .toFixed(1)')
    same('const re = /ab+/g\nconst result = "abbx".replace(re, "-") in {} || typeof re')
    same('let x = 2\nconst result = x < !--x')
    same('let n = 3\nconst result = n-- > 1')
    same('const t = (s, v) => s.join(v)\nconst result = t`a${1}b` + `${typeof t}`')
  })

  it('keeps comments out and strings, templates and regular expressions intact', () => {
    same('/* block */ const result = "a  b" + `c  ${" d "}` // line\n + /x  y/.source')
  })
})

describe('minify with renaming', () => {
  /** Minifies with renaming, and checks the script gives the same result. @param {string} code */
  const renamed = code => {
    const out = minify(code, { rename: true })
    assert.notEqual(out, minify(code), 'the snippet has names to shorten')
    assert.equal(run(out), run(code), `renamed:\n${out}`)
    return out
  }
  /** @param {string} code */
  const namesOf = code =>
    new Set(
      tokenize(code)
        .filter(t => t.type === 'name')
        .map(t => t.value)
    )

  it('gives local variables and parameters short names, while exported names, properties and globals keep theirs', () => {
    const src = `export function total(items, taxRate) {
  for (const entry of items) if (!entry.price) throw new Error('no price')
  const subtotal = items.reduce((sum, item) => sum + item.price, 0)
  let rounded = Math.round(subtotal * (1 + taxRate))
  return { subtotal, rounded, currency: globalThis.currency }
}
export const label = 'Total'
export class Counter {
  #count = 0
  increment(step) {
    this.#count += step
    return this.#count
  }
}
`
    const out = minify(src, { rename: true })
    const names = namesOf(out)
    for (const local of ['items', 'taxRate', 'entry', 'sum', 'item', 'step'])
      assert.ok(!names.has(local), `${local} gets a short name`)
    for (const kept of ['total', 'label', 'Counter', 'increment', 'reduce', 'price', 'Math'])
      assert.ok(names.has(kept), `${kept} keeps its name`)
    for (const kept of ['round', 'globalThis', 'currency', 'subtotal', 'rounded'])
      assert.ok(names.has(kept), `${kept} keeps its name, as a global or a property key`)
    assert.match(
      out,
      /\{subtotal:\w+,rounded:\w+,currency:/,
      'shorthand properties keep their keys'
    )
    assert.ok(!out.includes('#count'), 'private class members get short names too')
    assert.ok(out.length < minify(src).length * 0.8, `${out.length} bytes`)
    assert.equal(minify(src), minify(src, { rename: false }), 'renaming is opt-in')
  })

  it('never gives a binding a longer name than it has', () => {
    // Every one-letter name is taken, as a key, so the new names have two letters.
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'
    const src = `export const keys = { ${[...letters].map(c => `${c}: 1`).join(', ')} }
export function area(w, h) {
  const s = w * h
  return s
}
export function perimeter(width, height) {
  return 2 * (width + height)
}
`
    const out = minify(src, { rename: true })
    assert.match(out, /function area\(w,h\)\{const s=w\*h/, 'one-letter names stay')
    const names = namesOf(out)
    for (const long of ['width', 'height'])
      assert.ok(!names.has(long), `${long} gets a two-letter name`)
    assert.ok(out.length < minify(src).length, `${out.length} bytes`)
  })

  it('every snippet behaves the same before and after renaming', () => {
    // Shadowing, closures, and a block that declares the same name again.
    renamed(`function outer(value) {
  const inner = value * 2
  function nested(value) { return value + inner }
  { const inner = 100; value += inner }
  return [nested(1), value, inner]
}
const result = outer(5)`)
    // Parameters and declarations that destructure, shorthand properties and methods.
    renamed(`function f(a, { b, c = 3 }, [d, ...e], ...rest) {
  const { x, y: z = 9, ...others } = { x: a, q: 1 }
  let [p, , q = x] = [d, 0]
  const obj = { a, b, c, d, e, x, z, others, rest, p, q, method(a) { return a * 10 }, get g() { return b } }
  return [obj, obj.method(7), obj.g]
}
const result = f(1, { b: 2 }, [4, 5, 6], 7, 8)`)
    // Concise arrow bodies that end at a line break, a comma or a closing bracket.
    renamed(`function k(y) {
  const twice = y => y * 2
  const same = z => z
  y = same(y)
  const add = (a, b) => a
    + b
  const text = [1, 2].map(v => v
    .toString())
  const pick = (w, flag) => flag ? w : -w, other = w => w
  return [twice(3), y, add(1, 2), text, pick(4, false), other(y)]
}
const result = k(5)`)
    // Loops whose variables shadow a later declaration, with and without braces.
    renamed(`function loops(list) {
  const out = []
  for (const item of list) out.push(item * 2)
  for (let i = 0, n = list.length; i < n; i++) out.push(i)
  for (const [k, v] of Object.entries({ a: 1 })) {
    out.push(k + v)
  }
  const item = 'after'
  out.push(item)
  let n = 0
  if (list.length) for (const v of list) n += v
  else n = -1
  do n++
  while (n < 3)
  return [out, n]
}
const result = [loops([1, 2]), loops([])]`)
    // Loop bodies whose statement goes on after a condition or a function head at a line end.
    renamed(`function upgrade(version, upgrades) {
  const missing = []
  for (let v = 1; v < version; v++)
    if (typeof upgrades[v] !== 'function')
      missing.push(\`no upgrader from \${v}\`, { version: v })
  const v = 'after'
  for (const item of [v])
    missing.push(function ()
    { return item })
  const make = item => function ()
  { return item }
  return [missing.map(m => typeof m === 'function' ? m() : m), make(3)(), v]
}
const result = upgrade(3, { 2: () => 1 })`)
    // Concise bodies that end in a call named like a keyword, or after a multiplication.
    renamed(`function chain(value) {
  const safe = value => ({ catch: f => f(value) }).catch(v => v * 2)
  value = value + 1
  const double = n => 2 * n
  const times = n => 2 * double(n)
  n = value * 3
  return [safe(1), value, times(4), n]
}
let n = 0
const result = [chain(5), n]`)
    // Labels, switch cases, ternaries, and a catch binding that shadows a parameter.
    renamed(`function g(x) {
  let r = 0
  outer: for (const a of [1, 2, 3]) {
    for (const b of [1, 2]) {
      if (a * b === 4) break outer
      r += x ? a : b
    }
  }
  switch (x) {
    case r: { const t = 'r'; r = t; break }
    default: r = x > 1 ? { r } : [x]
  }
  try { throw new Error('boom') } catch (x) { r = [r, x.message] }
  return r
}
const result = [g(1), g(0), g(2)]`)
    // Classes inside functions: members keep their names, initialisers see the parameters,
    // and functions keep the names they were given.
    renamed(`function make(base) {
  const named = () => 1
  let later
  later = function () {}
  const options = { onDone: value => value }
  class Local {
    value = base
    static make(base) { return new Local().value + base }
    get base() { return base }
  }
  return [named.name, later.name, options.onDone.name, Local.name, Local.make(1), new Local().base]
}
const result = make(2)`)
    // Private members, templates, and defaults that read earlier parameters.
    renamed(`class Counter {
  #count = 0
  #step
  constructor(step) { this.#step = step }
  next() { this.#count += this.#step; return \`\${this.#count}/\${#count in this}\` }
  static #zero = 0
  static zero() { return Counter.#zero }
}
function h(a, b = a + 1, ...[c = b]) {
  const key = 'k'
  return { [key]: a, ...{ b }, c, get key() { return key } }
}
function shadow(Math) { return Math + 1 }
const c = new Counter(2)
c.next()
const result = [c.next(), Counter.zero(), h(1), shadow(1), Math.max(1, 2)]`)
  })

  it('every package passes its own tests with each of its source files renamed', () => {
    const mirror = mkdtempSync(join(tmpdir(), 'strata-renamed-'))
    try {
      const skip = /[\\/](node_modules|\.git|dist|test-results|playwright-report)$/
      cpSync(repo, mirror, { recursive: true, filter: from => !skip.test(from) })
      const packages = join(mirror, 'packages')
      let [plain, short] = [0, 0]
      for (const pkg of readdirSync(packages)) {
        const src = join(packages, pkg, 'src')
        if (!statSync(join(packages, pkg)).isDirectory()) continue
        for (const file of statSync(src, { throwIfNoEntry: false }) ? jsFiles(src) : []) {
          const code = readFileSync(file, 'utf8')
          const out = renameLocals(code)
          plain += minify(code).length
          short += minify(out).length
          writeFileSync(file, out)
        }
      }
      assert.ok(short < plain * 0.9, `renaming saves ${plain - short} of ${plain} bytes`)
      // Everything but this file, which would start another mirror. The renamed sources keep
      // their layout, so the repository-wide minify tests in modules.test.js run on them too.
      const files = findTestFiles(mirror).filter(
        file =>
          file.startsWith(packages + sep) &&
          !file.endsWith(join('plugins', 'test', 'minify.test.js'))
      )
      assert.ok(files.length > 30, `${files.length} test files`)
      const { NODE_TEST_CONTEXT, ...env } = process.env
      const result = spawnSync(process.execPath, ['--test', ...files], {
        cwd: mirror,
        env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
      const failures = result.stdout
        .split('\n')
        .filter(line => /^\s*not ok /.test(line))
        .join('\n')
      assert.equal(result.status, 0, `${failures}\n${result.stdout.slice(-3000)}${result.stderr}`)
    } finally {
      rmSync(mirror, { recursive: true, force: true })
    }
  })

  it('the facade bundle behaves the same before and after renaming', async () => {
    /** @type {Record<string, string>} */
    const files = {}
    for (const path of jsFiles(join(repo, 'packages')))
      files[relative(repo, path).split(sep).join('/')] = readFileSync(path, 'utf8')
    const entry = 'packages/facade/src/index.js'
    const script = emitScript(bundleModules(files, [entry]), { entry, format: 'cjs' })
    const out = minify(script, { rename: true })
    assert.ok(out.length < minify(script).length * 0.85, 'the bundle gets smaller')
    assert.deepEqual(await transcript(out), await transcript(script))
  })
})

/**
 * What a short console session prints and computes, from a CommonJS facade bundle.
 * @param {string} script
 */
async function transcript(script) {
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', script)(module)
  const strata = /** @type {any} */ (module.exports).createStrata({
    clock: () => Date.UTC(2026, 8, 26),
  })
  const p = await strata.projects.create('bundled')
  const svc = p.root.add('base:service', { name: 'Orders', props: { instances: 3 } })
  const db = p.root.add('base:store', { name: 'Orders DB' })
  p.root.connect(svc, db)
  const log = [p.root.nodes().map((/** @type {any} */ n) => [n.name, n.type, n.props])]
  const sub = p.root.extract([svc, db], { name: 'Orders system' })
  log.push(p.root.nodes().map((/** @type {any} */ n) => n.name))
  log.push(sub.nodes().map((/** @type {any} */ n) => n.name))
  log.push(['instances', 'availabilityTarget'].map(key => p.root.rollup(key)))
  for (const attempt of [() => p.root.add('nope'), () => svc.set({ instances: 'many' })])
    try {
      attempt()
    } catch (e) {
      log.push([/** @type {any} */ (e).code, /** @type {any} */ (e).message])
    }
  p.undo()
  log.push(p.root.nodes().map((/** @type {any} */ n) => n.name))
  p.redo()
  log.push(p.root.nodes().map((/** @type {any} */ n) => n.name))
  return log
}
