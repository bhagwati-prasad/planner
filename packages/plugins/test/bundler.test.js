// @ts-check
// Task 0005: the in-house bundler (spec §4 "Build", §8 "Packed bundle", eng §4).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { bundleModules, emitScript, packComponent, readBundle } from '../src/index.js'

const FIXTURES = fileURLToPath(new URL('./fixtures/bundler/', import.meta.url))

/** A fixture folder as the bundler's input: repository-style paths → source text. */
function folder(name) {
  const root = join(FIXTURES, name)
  /** @type {Record<string, string>} */
  const files = {}
  const walk = dir => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else files[relative(root, path).split(sep).join('/')] = readFileSync(path, 'utf8')
    }
  }
  walk(root)
  return files
}

/** Bundles and runs an IIFE in a fresh vm context; returns that context's global. */
function runIife(files, globals = {}) {
  const code = emitScript(bundleModules(files, ['main.js']), {
    entry: 'main.js',
    format: 'iife',
    globalName: 'Fixture',
  })
  const context = { ...globals }
  runInNewContext(code, context)
  return /** @type {any} */ (context).Fixture
}

/** Bundles to CommonJS, writes it to a file and loads it with Node's require. */
function requireCjs(files) {
  const dir = mkdtempSync(join(tmpdir(), 'strata-cjs-'))
  try {
    const file = join(dir, 'bundle.cjs')
    writeFileSync(
      file,
      emitScript(bundleModules(files, ['main.js']), { entry: 'main.js', format: 'cjs' })
    )
    return createRequire(import.meta.url)(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Imports a fixture natively, as ES modules, for comparison. */
async function importNative(name) {
  const dir = mkdtempSync(join(tmpdir(), 'strata-esm-'))
  try {
    cpSync(join(FIXTURES, name), dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }')
    return { ...(await import(pathToFileURL(join(dir, 'main.js')).href)) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Plain data from a namespace or exports object, for deep comparison. */
const plain = value => JSON.parse(JSON.stringify(value))

describe('bundler', () => {
  it('bundles a three-file fixture to an IIFE that runs in a vm context and exposes the global', () => {
    const fixture = runIife(folder('three-files'))
    assert.equal(fixture.message, 'HELLO, STRATA!')
    assert.equal(fixture.greet('you'), 'Hello, you')
    assert.equal(Object.prototype.toString.call(fixture), '[object Module]')
  })

  it('bundles the same fixture to CommonJS that Node can require', () => {
    const exported = requireCjs(folder('three-files'))
    assert.equal(exported.message, 'HELLO, STRATA!')
    assert.equal(exported.greet('Node'), 'Hello, Node')
  })

  it('evaluates circular imports like ES modules for the supported subset', async () => {
    const native = await importNative('cycle')
    const bundled = runIife(folder('cycle'))
    assert.deepEqual(
      plain({ results: bundled.results, order: bundled.order }),
      plain({ results: native.results, order: native.order })
    )
    assert.deepEqual(
      plain(native.order),
      ['odd', 'even', 'main'],
      'the native evaluation order the bundle must match'
    )
    assert.deepEqual(plain(requireCjs(folder('cycle')).results), [true, false, true, false])
  })

  it('rejects a binding it cannot keep live across a cycle, with E_BUNDLE_CYCLE', () => {
    const { problems } = bundleModules(folder('cycle-const'), ['main.js'])
    const cycle = problems.find(p => p.code === 'E_BUNDLE_CYCLE')
    assert.ok(cycle, JSON.stringify(problems))
    assert.equal(cycle.file, 'a.js')
    assert.match(cycle.message, /'LIMIT'.*b\.js.*cycle/)
  })

  it('fails bare specifiers other than d3 and three with E_BUNDLE_BARE_SPECIFIER', () => {
    const files = folder('bare')
    const { problems } = bundleModules(files, ['main.js'])
    assert.deepEqual(
      problems.map(p => [p.code, p.file, p.line]),
      [['E_BUNDLE_BARE_SPECIFIER', 'main.js', 3]]
    )
    assert.match(problems[0].message, /lodash\/merge/)
    assert.throws(
      () => emitScript(bundleModules(files, ['main.js']), { entry: 'main.js', format: 'iife' }),
      err => err.code === 'E_BUNDLE_BARE_SPECIFIER'
    )

    const allowed = {
      'main.js': files['main.js']
        .replace("import merge from 'lodash/merge'\n", '')
        .replace('export { merge }\n', ''),
    }
    const run = runIife(allowed, {
      d3: { select: selector => `selected ${selector}` },
      THREE: { BoxGeometry: class {} },
    })
    assert.equal(run.picked, 'selected #root', 'd3 comes from the vendored global')
    assert.equal(run.geometry, 'function', 'three comes from the vendored global')
  })

  describe('re-export pruning', () => {
    // A library entry made only of re-exports, like core's index.js, whose modules each note
    // that they ran.
    const library = {
      'main.js': "import { a, alpha } from './lib/index.js'\nexport const value = a() + alpha\n",
      'lib/index.js':
        "// The library's entry.\nexport { a } from './a.js'\nexport { b } from './b.js'\nexport { inner as alpha } from './inner/index.js'\n",
      'lib/a.js': "globalThis.ran.push('a')\nexport function a() {\n  return 'a'\n}\n",
      'lib/b.js': "globalThis.ran.push('b')\nexport const b = 'b'\n",
      'lib/inner/index.js':
        "export { inner } from './inner.js'\nexport { unused } from './unused.js'\n",
      'lib/inner/inner.js': "globalThis.ran.push('inner')\nexport const inner = '+inner'\n",
      'lib/inner/unused.js': "globalThis.ran.push('unused')\nexport const unused = 0\n",
    }
    /** @param {Record<string, string>} files */
    const run = files => {
      const context = /** @type {any} */ ({ ran: [] })
      context.globalThis = context
      runInNewContext(
        emitScript(bundleModules(files, ['main.js']), {
          entry: 'main.js',
          format: 'iife',
          globalName: 'Fixture',
        }),
        context
      )
      return { value: context.Fixture.value, ran: context.ran }
    }

    it('follows imported names through modules made only of re-exports, and leaves out the rest', () => {
      const bundle = bundleModules(library, ['main.js'])
      assert.deepEqual(bundle.problems, [])
      assert.deepEqual(
        bundle.order.filter(p => !p.endsWith('index.js')),
        ['lib/a.js', 'lib/inner/inner.js', 'main.js']
      )
      assert.deepEqual(run(library), { value: 'a+inner', ran: ['a', 'inner'] })
    })

    it('keeps every module that a namespace import, an export * or a module with its own code reaches', () => {
      const namespace = {
        ...library,
        'main.js': "import * as lib from './lib/index.js'\nexport const value = lib.b\n",
      }
      const whole = bundleModules(namespace, ['main.js']).order
      for (const path of ['lib/a.js', 'lib/b.js', 'lib/inner/inner.js', 'lib/inner/unused.js'])
        assert.ok(whole.includes(path), `${path} is bundled for the namespace`)
      assert.deepEqual(run(namespace), { value: 'b', ran: ['b'] }, 'each runs when first read')
      const star = {
        ...library,
        'lib/index.js': "export * from './a.js'\nexport * from './b.js'\n",
      }
      star['main.js'] = "import { a } from './lib/index.js'\nexport const value = a()\n"
      assert.deepEqual(run(star).ran, ['a', 'b'])
      const own = {
        ...library,
        'lib/index.js': `${library['lib/index.js']}export const version = 1\n`,
      }
      assert.ok(bundleModules(own, ['main.js']).order.includes('lib/b.js'))
      assert.deepEqual(run(own).ran, ['a', 'b', 'inner'])
    })
  })

  it('produces byte-identical output across runs and input orders', () => {
    const files = folder('three-files')
    const reversed = Object.fromEntries(Object.entries(files).reverse())
    for (const format of /** @type {const} */ (['iife', 'cjs'])) {
      const first = emitScript(bundleModules(files, ['main.js']), {
        entry: 'main.js',
        format,
        globalName: 'Fixture',
      })
      const second = emitScript(bundleModules(reversed, ['main.js']), {
        entry: 'main.js',
        format,
        globalName: 'Fixture',
      })
      assert.equal(first, second, format)
    }
  })

  it('packs a component with its modules as source text', () => {
    const manifest = {
      strataApi: '^1.0',
      id: 'acme.greeter',
      name: 'Greeter',
      version: '1.0.0',
      extends: 'base:service',
      entry: 'main.js',
    }
    const { bundle, problems } = packComponent({
      ...folder('three-files'),
      'manifest.json': JSON.stringify(manifest),
    })
    assert.deepEqual(
      problems.filter(p => p.level === 'error'),
      []
    )
    assert.ok(bundle)
    assert.deepEqual(Object.keys(bundle.modules), ['lib/greet.js', 'lib/shout.js', 'main.js'])
    assert.ok(
      Object.values(bundle.modules).every(
        source => typeof source === 'string' && source.startsWith('function (')
      )
    )
    assert.deepEqual(readBundle(JSON.stringify(bundle)).modules, bundle.modules)
  })
})
