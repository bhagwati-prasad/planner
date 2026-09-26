/**
 * The bundler (spec §4 "Build"): resolves a module graph from a set of files, transforms each
 * module with `transformModule`, checks the graph (relative imports only, every file present,
 * no cycles, every imported name exported) and emits classic scripts. The same code packs
 * components (`strata pack`, the in-browser upload packer) and builds the app.
 */
import { transformModule, transformJson, ModuleError, MODULE_PARAMS } from './modules.js'

/**
 * @typedef {object} Problem
 * @property {'error'|'warning'} level
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
export function normalizePath (path) {
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
const dirOf = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/**
 * Resolves a relative import against the importing file.
 * @param {string} from
 * @param {string} specifier
 * @returns {{ path: string } | { error: string }}
 */
export function resolveImport (from, specifier) {
  if (!/^\.\.?\//.test(specifier)) {
    return { error: /^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('/')
      ? `imports '${specifier}': only relative imports ('./lib/x.js') can be bundled`
      : `imports the package '${specifier}': bundles cannot use npm packages; copy the code into the folder and import it with a relative path` }
  }
  const path = normalizePath(`${dirOf(from)}/${specifier}`)
  if (path === null) return { error: `imports '${specifier}', which is outside the folder being bundled` }
  return { path }
}

/**
 * Builds and checks the module graph reachable from `entries`.
 * @param {Record<string, string>} files  POSIX path → source text
 * @param {string[]} entries
 * @returns {BundleResult}
 */
export function bundleModules (files, entries) {
  /** @type {Problem[]} */
  const problems = []
  /** @type {Record<string, import('./modules.js').TransformedModule>} */
  const modules = {}
  /** @type {Map<string, string[]>} path → resolved dependency paths */
  const deps = new Map()
  const error = (file, message, line) => problems.push({ level: 'error', file, line, message })

  const visit = (path, from, line) => {
    if (deps.has(path)) return
    if (!(path in files)) {
      const hint = [`${path}.js`, `${path}/index.js`].find(p => p in files)
      error(from ?? path, `${from ? `imports '${path}'` : `entry '${path}'`}, which does not exist${hint ? `. Did you mean '${hint}'? Imports need the file extension` : ''}`, line)
      deps.set(path, [])
      return
    }
    let mod
    try {
      mod = path.endsWith('.json') ? transformJson(files[path]) : transformModule(files[path])
    } catch (err) {
      if (!(err instanceof ModuleError)) throw err
      error(path, err.message, err.line)
      deps.set(path, [])
      return
    }
    modules[path] = mod
    const list = []
    deps.set(path, list)
    for (const imp of mod.imports) {
      const r = resolveImport(path, imp.specifier)
      if ('error' in r) { error(path, r.error, imp.line); continue }
      if (r.path.endsWith('.json') && imp.attributes?.type !== 'json') {
        problems.push({ level: 'warning', file: path, line: imp.line, message: `imports JSON '${imp.specifier}' without "with { type: 'json' }"; browsers require it for native modules` })
      }
      list.push(r.path)
      visit(r.path, path, imp.line)
    }
    for (const d of mod.dynamic) {
      if (d.specifier === null) {
        problems.push({ level: 'warning', file: path, line: d.line, message: 'import() with a computed specifier can only load modules that are bundled anyway' })
        continue
      }
      const r = resolveImport(path, d.specifier)
      if ('error' in r) { error(path, r.error, d.line); continue }
      visit(r.path, path, d.line)
    }
  }
  for (const entry of entries) {
    const path = normalizePath(entry)
    if (path === null) error(entry, `entry '${entry}' is outside the folder being bundled`)
    else visit(path, null, undefined)
  }

  // Cycles and evaluation order.
  const order = []
  const state = new Map()
  const walk = (path, stack) => {
    state.set(path, 'active')
    stack.push(path)
    for (const dep of deps.get(path) ?? []) {
      if (state.get(dep) === 'active') {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep]
        error(path, `import cycle: ${cycle.join(' → ')}. Bundled imports must not form a cycle; move the shared code into a module both can import`)
      } else if (!state.has(dep)) walk(dep, stack)
    }
    stack.pop()
    state.set(path, 'done')
    order.push(path)
  }
  for (const path of [...deps.keys()].sort()) if (!state.has(path)) walk(path, [])

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
      const wanted = [...imp.bindings.map(b => b.imported), ...imp.reexports.map(x => x.imported)].filter(n => n !== '*')
      for (const name of wanted) {
        if (available.has(name)) continue
        const close = [...available].find(a => a.toLowerCase() === name.toLowerCase())
        error(path, `'${imp.specifier}' has no export named '${name}'${close ? `. Did you mean '${close}'?` : ''}`, imp.line)
      }
    }
  }

  return { modules, order, problems }
}

/**
 * The module runtime. It is self-contained so that its source (`String(createModuleRuntime)`)
 * can be embedded in generated scripts and in the simulation worker.
 * @param {Record<string, Function>} defs  path → wrapped module function
 */
export function createModuleRuntime (defs) {
  const cache = Object.create(null)
  function resolve (from, spec) {
    if (!/^\.\.?\//.test(spec)) throw new Error('Cannot import \'' + spec + '\' from ' + from + ': only bundled relative imports are available')
    const parts = from.split('/')
    parts.pop()
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.' && seg !== '') parts.push(seg)
    }
    return parts.join('/')
  }
  function load (path) {
    if (cache[path]) return cache[path]
    const def = defs[path]
    if (typeof def !== 'function') throw new Error('Module not found: ' + path)
    const ns = Object.create(null)
    Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' })
    cache[path] = ns
    const define = function (getters, stars) {
      for (const key of Object.keys(getters)) Object.defineProperty(ns, key, { get: getters[key], enumerable: true })
      for (const star of stars || []) {
        for (const key of Object.keys(star)) {
          if (key !== 'default' && !Object.prototype.hasOwnProperty.call(ns, key)) Object.defineProperty(ns, key, { get: function () { return star[key] }, enumerable: true })
        }
      }
    }
    const req = function (spec) { return load(resolve(path, spec)) }
    const dyn = function (spec) { return new Promise(function (ok) { ok(req(spec)) }) }
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
export function moduleTable (modules, order) {
  return `{\n${order.filter(p => p in modules).map(p => {
    const m = modules[p]
    return `// ${p}\n${JSON.stringify(p)}: ${typeof m === 'string' ? m : m.code}`
  }).join(',\n')}\n}`
}

/**
 * Emits a classic script that evaluates `entry` and exposes its exports.
 *   iife: assigns them to `globalThis[globalName]` (or just runs the entry without a name);
 *   cjs:  assigns them to `module.exports`.
 * @param {BundleResult} bundle
 * @param {{ entry: string, format: 'iife'|'cjs', globalName?: string, banner?: string }} options
 */
export function emitScript (bundle, { entry, format, globalName, banner = '' }) {
  const errors = bundle.problems.filter(p => p.level === 'error')
  if (errors.length) throw new Error(`Cannot emit a bundle with errors:\n${errors.map(formatProblem).join('\n')}`)
  const run = `__runtime.load(${JSON.stringify(normalizePath(entry))})`
  const expose = format === 'cjs'
    ? `module.exports = ${run};`
    : globalName ? `globalThis[${JSON.stringify(globalName)}] = ${run};` : `${run};`
  return `${banner ? `${banner.trim()}\n` : ''}(function () {
'use strict';
var __runtime = (${String(createModuleRuntime)})(${moduleTable(bundle.modules, bundle.order)});
${expose}
})();
`
}

/** @param {Problem} p */
export function formatProblem (p) {
  return `${p.file}${p.line ? `:${p.line}` : ''}: ${p.level}: ${p.message}`
}

export { MODULE_PARAMS }
