/**
 * The bundler (spec §4 "Build"): resolves a module graph from a set of files, transforms each
 * module with `transformModule`, checks the graph (relative imports only, every file present,
 * every imported name exported, cycles only where bindings stay live) and emits classic
 * scripts. The same code packs components (`strata pack`, the in-browser upload packer) and
 * builds the app.
 *
 * Every problem carries a code (E_BUNDLE_*), and emitScript throws a StrataError with it.
 */
import { StrataError } from '../../core/src/index.js'
import { transformModule, transformJson, ModuleError, MODULE_PARAMS } from './modules.js'

/**
 * The only bare specifiers a bundle may import (eng §4): vendored libraries, loaded as classic
 * scripts before the bundle and read from their globals.
 */
export const EXTERNALS = Object.freeze({ d3: 'd3', three: 'THREE' })

/**
 * @typedef {object} Problem
 * @property {'error'|'warning'} level
 * @property {import('../../core/src/errors.js').ErrorCode} [code]  E_BUNDLE_* for errors
 * @property {string} file
 * @property {number} [line]
 * @property {string} message
 *
 * @typedef {object} BundleResult
 * @property {Record<string, import('./modules.js').TransformedModule>} modules  by path, reachable modules only
 * @property {string[]} order   dependencies before dependants
 * @property {Problem[]} problems
 */

/**
 * Normalises a POSIX path: removes '.' segments and resolves '..'. Returns null when the
 * path climbs above the root.
 * @param {string} path
 */
export function normalizePath(path) {
  const out = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(seg)
  }
  return out.join('/')
}

/** @param {string} path */
const dirOf = path => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/**
 * Resolves an import against the importing file: a module path, one of the EXTERNALS, or an
 * error with its code.
 * @param {string} from
 * @param {string} specifier
 * @returns {{ path: string } | { external: string } | { error: string, code: import('../../core/src/errors.js').ErrorCode }}
 */
export function resolveImport(from, specifier) {
  if (!/^\.\.?\//.test(specifier)) {
    if (Object.hasOwn(EXTERNALS, specifier)) return { external: specifier }
    return /^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('/')
      ? {
          code: 'E_BUNDLE_BARE_SPECIFIER',
          error: `imports '${specifier}': only relative imports ('./lib/x.js') can be bundled`,
        }
      : {
          code: 'E_BUNDLE_BARE_SPECIFIER',
          error: `imports the package '${specifier}': bundles cannot use npm packages (only ${Object.keys(EXTERNALS).join(' and ')}, which are vendored); copy the code into the folder and import it with a relative path`,
        }
  }
  const path = normalizePath(`${dirOf(from)}/${specifier}`)
  if (path === null)
    return {
      code: 'E_BUNDLE_OUTSIDE_ROOT',
      error: `imports '${specifier}', which is outside the folder being bundled`,
    }
  return { path }
}

/**
 * Builds and checks the module graph reachable from `entries`.
 * @param {Record<string, string>} files  POSIX path → source text
 * @param {string[]} entries
 * @returns {BundleResult}
 */
export function bundleModules(files, entries) {
  /** @type {Problem[]} */
  const problems = []
  /** @type {Record<string, import('./modules.js').TransformedModule>} */
  const modules = {}
  /** @type {Map<string, string[]>} path → resolved dependency paths */
  const deps = new Map()
  const error = (code, file, message, line) =>
    problems.push({ level: 'error', code, file, line, message })

  const visit = (path, from, line) => {
    if (deps.has(path)) return
    if (!(path in files)) {
      const hint = [`${path}.js`, `${path}/index.js`].find(p => p in files)
      error(
        'E_BUNDLE_MISSING_MODULE',
        from ?? path,
        `${from ? `imports '${path}'` : `entry '${path}'`}, which does not exist${hint ? `. Did you mean '${hint}'? Imports need the file extension` : ''}`,
        line
      )
      deps.set(path, [])
      return
    }
    let mod
    try {
      mod = path.endsWith('.json') ? transformJson(files[path]) : transformModule(files[path])
    } catch (err) {
      if (!(err instanceof ModuleError)) throw err
      error('E_BUNDLE_SYNTAX', path, err.message, err.line)
      deps.set(path, [])
      return
    }
    modules[path] = mod
    const list = []
    deps.set(path, list)
    for (const imp of mod.imports) {
      const r = resolveImport(path, imp.specifier)
      if ('error' in r) {
        error(r.code, path, r.error, imp.line)
        continue
      }
      if ('external' in r) continue
      if (r.path.endsWith('.json') && imp.attributes?.type !== 'json') {
        problems.push({
          level: 'warning',
          file: path,
          line: imp.line,
          message: `imports JSON '${imp.specifier}' without "with { type: 'json' }"; browsers require it for native modules`,
        })
      }
      list.push(r.path)
      visit(r.path, path, imp.line)
    }
    for (const d of mod.dynamic) {
      if (d.specifier === null) {
        problems.push({
          level: 'warning',
          file: path,
          line: d.line,
          message:
            'import() with a computed specifier can only load modules that are bundled anyway',
        })
        continue
      }
      const r = resolveImport(path, d.specifier)
      if ('error' in r) {
        error(r.code, path, r.error, d.line)
        continue
      }
      if ('path' in r) visit(r.path, path, d.line)
    }
  }
  for (const entry of entries) {
    const path = normalizePath(entry)
    if (path === null)
      error('E_BUNDLE_OUTSIDE_ROOT', entry, `entry '${entry}' is outside the folder being bundled`)
    else visit(path, null, undefined)
  }

  // Evaluation order: dependencies before dependants, as native modules evaluate them.
  const order = []
  const seen = new Set()
  const walk = path => {
    seen.add(path)
    for (const dep of deps.get(path) ?? []) if (!seen.has(dep)) walk(dep)
    order.push(path)
  }
  for (const path of [...deps.keys()].sort()) if (!seen.has(path)) walk(path)
  const included = neededModules(modules, entries)

  checkCycles(modules, deps, error)

  // Every imported name must be exported.
  const exportCache = new Map()
  const exportsOf = (path, seen = new Set()) => {
    if (exportCache.has(path)) return exportCache.get(path)
    const mod = modules[path]
    const names = new Set(mod?.exports ?? [])
    if (mod && !seen.has(path)) {
      seen.add(path)
      for (const imp of mod.imports) {
        if (!imp.star) continue
        const r = resolveImport(path, imp.specifier)
        if ('path' in r) for (const n of exportsOf(r.path, seen)) if (n !== 'default') names.add(n)
      }
    }
    exportCache.set(path, names)
    return names
  }
  for (const [path, mod] of Object.entries(modules)) {
    for (const imp of mod.imports) {
      const r = resolveImport(path, imp.specifier)
      if (!('path' in r) || !modules[r.path]) continue
      const available = exportsOf(r.path)
      const wanted = [
        ...imp.bindings.map(b => b.imported),
        ...imp.reexports.map(x => x.imported),
      ].filter(n => n !== '*')
      for (const name of wanted) {
        if (available.has(name)) continue
        const close = [...available].find(a => a.toLowerCase() === name.toLowerCase())
        error(
          'E_BUNDLE_MISSING_EXPORT',
          path,
          `'${imp.specifier}' has no export named '${name}'${close ? `. Did you mean '${close}'?` : ''}`,
          imp.line
        )
      }
    }
  }

  return { modules, order: order.filter(p => included.has(p)), problems }
}

/**
 * The modules a bundle needs. A module made only of named re-exports (`reexportsOnly`) is
 * looked through: importing some of its names needs the modules that define them, not every
 * module it re-exports. A namespace import, `export *` or `import()` of it needs all of them.
 * @param {Record<string, import('./modules.js').TransformedModule>} modules
 * @param {string[]} entries
 */
function neededModules(modules, entries) {
  const included = new Set()
  const whole = new Set()
  const named = new Set()
  /** @param {string} from @param {string|null} specifier */
  const target = (from, specifier) => {
    if (specifier === null) return null
    const r = resolveImport(from, specifier)
    return 'path' in r && modules[r.path] ? r.path : null
  }
  /** Needs `path` and everything it imports. @param {string|null} path */
  const need = path => {
    if (path === null || whole.has(path)) return
    whole.add(path)
    included.add(path)
    const mod = modules[path]
    for (const imp of mod.imports) {
      const to = target(path, imp.specifier)
      const names = [...imp.bindings.map(b => b.imported), ...imp.reexports.map(r => r.imported)]
      if (
        to &&
        !mod.reexportsOnly &&
        modules[to].reexportsOnly &&
        !imp.star &&
        !names.includes('*')
      )
        for (const name of names) needName(to, name)
      else need(to)
    }
    for (const d of mod.dynamic) need(target(path, d.specifier))
  }
  /** Needs what defines `name` in the re-export module `path`. @param {string} path @param {string} name */
  const needName = (path, name) => {
    if (whole.has(path) || named.has(`${path}#${name}`)) return
    named.add(`${path}#${name}`)
    included.add(path)
    for (const imp of modules[path].imports)
      for (const r of imp.reexports) {
        if (r.exported !== name) continue
        const to = target(path, imp.specifier)
        if (to && modules[to].reexportsOnly) needName(to, r.imported)
        else need(to)
      }
  }
  for (const entry of entries) {
    const path = normalizePath(entry)
    if (path !== null && modules[path]) need(path)
  }
  return included
}

/**
 * Import cycles (strongly connected parts of the graph). Imports are bound when a module
 * starts, so only bindings that already exist then behave as native modules across a cycle:
 * hoisted function declarations and namespace imports (plus re-exports, which are read on
 * access). Anything else crossing a cycle is reported as E_BUNDLE_CYCLE.
 * @param {Record<string, import('./modules.js').TransformedModule>} modules
 * @param {Map<string, string[]>} deps
 * @param {(code: any, file: string, message: string, line?: number) => void} error
 */
function checkCycles(modules, deps, error) {
  // Tarjan's algorithm, iterating in path order for stable output.
  const index = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  /** @type {Map<string, string[]>} path → the members of its cycle */
  const cycleOf = new Map()
  let next = 0
  const connect = v => {
    index.set(v, next)
    low.set(v, next++)
    stack.push(v)
    onStack.add(v)
    for (const w of deps.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)))
    }
    if (low.get(v) !== index.get(v)) return
    const members = []
    for (let w; w !== v;) {
      w = stack.pop()
      onStack.delete(w)
      members.push(w)
    }
    members.sort()
    if (members.length > 1 || (deps.get(v) ?? []).includes(v))
      for (const m of members) cycleOf.set(m, members)
  }
  for (const path of [...deps.keys()].sort()) if (!index.has(path)) connect(path)

  for (const [path, members] of cycleOf) {
    for (const imp of modules[path]?.imports ?? []) {
      const r = resolveImport(path, imp.specifier)
      if (!('path' in r) || !members.includes(r.path)) continue
      const live = new Set(modules[r.path]?.functionExports ?? [])
      for (const b of imp.bindings) {
        if (b.imported === '*' || live.has(b.imported)) continue
        error(
          'E_BUNDLE_CYCLE',
          path,
          `'${b.imported}' from '${imp.specifier}' crosses an import cycle (${members.join(', ')}). Only function declarations and namespace imports (import * as ns) stay live across a cycle; move '${b.imported}' out of the cycle or import the module as a namespace`,
          imp.line
        )
      }
    }
  }
}

/**
 * The module runtime. It is self-contained so that its source (`String(createModuleRuntime)`)
 * can be embedded in generated scripts and in the simulation worker.
 * @param {Record<string, Function>} defs  path → wrapped module function
 */
export function createModuleRuntime(defs) {
  const cache = Object.create(null)
  function resolve(from, spec) {
    if (!/^\.\.?\//.test(spec))
      throw new Error(
        "Cannot import '" +
          spec +
          "' from " +
          from +
          ': only bundled relative imports are available'
      )
    const parts = from.split('/')
    parts.pop()
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.' && seg !== '') parts.push(seg)
    }
    return parts.join('/')
  }
  function load(path) {
    if (cache[path]) return cache[path]
    const def = defs[path]
    if (typeof def !== 'function') throw new Error('Module not found: ' + path)
    const ns = Object.create(null)
    Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' })
    cache[path] = ns
    const define = function (getters, stars) {
      for (const key of Object.keys(getters))
        Object.defineProperty(ns, key, { get: getters[key], enumerable: true })
      for (const star of stars || []) {
        for (const key of Object.keys(star)) {
          if (key !== 'default' && !Object.prototype.hasOwnProperty.call(ns, key))
            Object.defineProperty(ns, key, {
              get: function () {
                return star[key]
              },
              enumerable: true,
            })
        }
      }
    }
    const req = function (spec) {
      // Vendored libraries (d3, three) are classic scripts that set a global.
      if (spec === 'd3' || spec === 'three') {
        const lib = globalThis[spec === 'd3' ? 'd3' : 'THREE']
        if (!lib)
          throw new Error(spec + ' is not loaded: add its vendored script before this bundle')
        return lib
      }
      return load(resolve(path, spec))
    }
    const dyn = function (spec) {
      return new Promise(function (ok) {
        ok(req(spec))
      })
    }
    def(req, define, { url: path }, dyn)
    Object.preventExtensions(ns)
    return ns
  }
  return { load: load, resolve: resolve }
}

/**
 * Source text of an object literal mapping paths to wrapped module functions.
 * @param {Record<string, import('./modules.js').TransformedModule|string>} modules
 * @param {string[]} order
 */
export function moduleTable(modules, order) {
  return `{\n${order
    .filter(p => p in modules)
    .map(p => {
      const m = modules[p]
      return `// ${p}\n${JSON.stringify(p)}: ${typeof m === 'string' ? m : m.code}`
    })
    .join(',\n')}\n}`
}

/**
 * Emits a classic script that evaluates `entry` and exposes its exports.
 *   iife: assigns them to `globalThis[globalName]` (or just runs the entry without a name);
 *   cjs:  assigns them to `module.exports`.
 * @param {BundleResult} bundle
 * @param {{ entry: string, format: 'iife'|'cjs', globalName?: string, banner?: string }} options
 */
export function emitScript(bundle, { entry, format, globalName, banner = '' }) {
  const errors = bundle.problems.filter(p => p.level === 'error')
  if (errors.length) {
    throw new StrataError(
      errors[0].code ?? 'INVALID',
      `Cannot emit a bundle with errors:\n${errors.map(formatProblem).join('\n')}`,
      errors
    )
  }
  const run = `__runtime.load(${JSON.stringify(normalizePath(entry))})`
  const expose =
    format === 'cjs'
      ? `module.exports = ${run};`
      : globalName
        ? `globalThis[${JSON.stringify(globalName)}] = ${run};`
        : `${run};`
  return `${banner ? `${banner.trim()}\n` : ''}(function () {
'use strict';
var __runtime = (${String(createModuleRuntime)})(${moduleTable(bundle.modules, bundle.order)});
${expose}
})();
`
}

/** @param {Problem} p */
export function formatProblem(p) {
  return `${p.file}${p.line ? `:${p.line}` : ''}: ${p.level}: ${p.message}`
}

export { MODULE_PARAMS }
