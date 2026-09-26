/**
 * The component packer (spec §7 "Packed bundle"): turns a plugin folder into one bundle
 * object and its `.strata.js` script. The CLI (`strata pack`), the local server and the
 * in-browser upload all call `packComponent` with the folder's files, so they produce the
 * same bytes.
 *
 * A bundle carries the manifest as authored, the icon markup, every reachable module as
 * wrapped source text, text assets, and a SHA-256 integrity over all of it. Modules travel as
 * text so the page only registers metadata; the simulation worker (R1) evaluates them.
 */
import { StrataError } from '../../core/src/index.js'
import { bundleModules, formatProblem } from './bundle.js'
import { validateManifest, checkIcon } from './manifest.js'
import { canonicalJson, integrityOf } from '../../core/src/index.js'

export const BUNDLE_FORMAT = 'strata-component@1'
const SCRIPT_CALL = 'Strata.registerComponent('
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024

/**
 * @typedef {object} ComponentBundle
 * @property {string} format      'strata-component@1'
 * @property {Record<string, any>} manifest  manifest.json as authored
 * @property {string|null} icon   SVG markup
 * @property {Record<string, string>} modules  path → wrapped module source
 * @property {string|null} entry
 * @property {Record<string, string>} assets   path → text (README, templates, ...)
 * @property {string} integrity  'sha256-…' over everything above
 *
 * @typedef {import('./bundle.js').Problem} Problem
 *
 * @typedef {object} PackResult
 * @property {ComponentBundle|null} bundle  null when there are errors
 * @property {string|null} script           the .strata.js text
 * @property {string|null} fileName         '<folder>.strata.js'
 * @property {Problem[]} problems
 */

const decoder = new TextDecoder('utf-8', { fatal: true })

/** @param {string|Uint8Array} content @returns {string|null} text, or null for binary */
export function asText(content) {
  if (typeof content === 'string') return content
  try {
    const text = decoder.decode(content)
    return text.includes('\u0000') ? null : text.replace(/^﻿/, '')
  } catch {
    return null
  }
}

/** Files that never go into a bundle. @param {string} path */
function ignored(path) {
  const parts = path.split('/')
  return (
    parts.some(p => p.startsWith('.') || p === 'node_modules' || p === '__MACOSX') ||
    parts[0] === 'tests' ||
    path === 'package.json' ||
    path === 'package-lock.json' ||
    path.endsWith('.strata.js') ||
    /(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(path)
  )
}

/**
 * Normalises uploaded paths: POSIX separators, no leading './', and a single top-level folder
 * removed when the manifest sits inside it (as in a zip of the folder).
 * @param {Record<string, string|Uint8Array>} files
 */
export function normalizeFiles(files) {
  /** @type {Record<string, string|Uint8Array>} */
  let out = {}
  for (const [path, content] of Object.entries(files))
    out[
      path
        .replace(/\\/g, '/')
        .replace(/^(\.\/)+/, '')
        .replace(/^\/+/, '')
    ] = content
  if (!('manifest.json' in out)) {
    const manifests = Object.keys(out).filter(p => !ignored(p) && /^[^/]+\/manifest\.json$/.test(p))
    if (manifests.length === 1) {
      const prefix = manifests[0].slice(0, -'manifest.json'.length)
      /** @type {Record<string, string|Uint8Array>} */
      const stripped = {}
      for (const [path, content] of Object.entries(out))
        if (path.startsWith(prefix)) stripped[path.slice(prefix.length)] = content
      out = stripped
    }
  }
  return out
}

/** @param {Omit<ComponentBundle, 'integrity'>} bundle */
export function bundleIntegrity(bundle) {
  const { format, manifest, icon, modules, entry, assets } = bundle
  return integrityOf(canonicalJson({ format, manifest, icon, modules, entry, assets }))
}

/**
 * Offset of the first syntax error in JSON text (engines do not always report one).
 * @param {string} text
 * @returns {number}
 */
export function jsonErrorOffset(text) {
  let i = 0
  const ws = () => {
    while (/[ \t\n\r]/.test(text[i] ?? '')) i++
  }
  const bad = () => {
    throw i
  }
  const literal = word => {
    if (text.startsWith(word, i)) i += word.length
    else bad()
  }
  const string = () => {
    if (text[i] !== '"') bad()
    i++
    while (text[i] !== '"') {
      if (i >= text.length || text[i] === '\n') bad()
      if (text[i] === '\\') {
        i++
        if (text[i] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) bad()
          i += 4
        } else if (!'"\\/bfnrt'.includes(text[i])) bad()
      }
      i++
    }
    i++
  }
  const value = () => {
    ws()
    const ch = text[i]
    if (ch === '{') {
      i++
      ws()
      if (text[i] === '}') {
        i++
        return
      }
      for (;;) {
        ws()
        string()
        ws()
        if (text[i] !== ':') bad()
        i++
        value()
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === '}') {
          i++
          return
        }
        bad()
      }
    }
    if (ch === '[') {
      i++
      ws()
      if (text[i] === ']') {
        i++
        return
      }
      for (;;) {
        value()
        ws()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === ']') {
          i++
          return
        }
        bad()
      }
    }
    if (ch === '"') return string()
    if (ch === 't') return literal('true')
    if (ch === 'f') return literal('false')
    if (ch === 'n') return literal('null')
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (!m) bad()
    i += m[0].length
  }
  try {
    value()
    ws()
    if (i < text.length) bad()
    return -1
  } catch (at) {
    if (typeof at !== 'number') throw at
    return at
  }
}

/** ' (line L, column C)' for a JSON syntax error. @param {string} text */
function jsonWhere(text) {
  const at = jsonErrorOffset(text)
  if (at < 0) return ''
  const before = text.slice(0, at)
  return ` (line ${before.split('\n').length}, column ${at - before.lastIndexOf('\n')})`
}

/**
 * Packs a plugin folder.
 * @param {Record<string, string|Uint8Array>} input  folder-relative path → content
 * @param {{ name?: string }} [options]  the folder name, for the output file name
 * @returns {PackResult}
 */
export function packComponent(input, { name } = {}) {
  const files = normalizeFiles(input)
  /** @type {Problem[]} */
  const problems = []
  const error = (file, message, line) => problems.push({ level: 'error', file, line, message })
  const warn = (file, message) => problems.push({ level: 'warning', file, message })
  const failed = () => problems.some(p => p.level === 'error')
  const result = () => ({ bundle: null, script: null, fileName: null, problems })

  const paths = Object.keys(files)
    .filter(p => !ignored(p))
    .sort()
  if (!paths.includes('manifest.json')) {
    error(
      'manifest.json',
      paths.length ? 'No manifest.json at the top of the folder' : 'The folder is empty'
    )
    return result()
  }

  /** @type {Record<string, string>} */
  const text = {}
  const binary = []
  for (const path of paths) {
    const t = asText(files[path])
    if (t === null) binary.push(path)
    else text[path] = t
  }

  let manifest
  try {
    manifest = JSON.parse(text['manifest.json'] ?? '')
  } catch (err) {
    error('manifest.json', `Invalid JSON${jsonWhere(text['manifest.json'] ?? '')}: ${err.message}`)
    return result()
  }
  problems.push(...validateManifest(manifest, { files: paths }))
  if (failed()) return result()

  // Modules reachable from the entry and the migrations.
  const entries = [manifest.entry, ...Object.values(manifest.migrations ?? {})].filter(Boolean)
  const jsFiles = Object.fromEntries(
    Object.entries(text).filter(([p]) => p.endsWith('.js') || p.endsWith('.json'))
  )
  const graph = bundleModules(jsFiles, entries)
  problems.push(...graph.problems)

  let icon = null
  if (manifest.icon) {
    icon = text[manifest.icon] ?? null
    if (icon === null) error(manifest.icon, 'The icon is not a text SVG file')
    else problems.push(...checkIcon(icon, manifest.icon))
  }
  if (failed()) return result()

  const used = new Set([
    'manifest.json',
    ...(manifest.icon ? [manifest.icon] : []),
    ...Object.keys(graph.modules),
  ])
  /** @type {Record<string, string>} */
  const assets = {}
  for (const [path, content] of Object.entries(text)) {
    if (used.has(path)) continue
    if (path.endsWith('.js')) {
      warn(path, `Not imported by the entry or a migration, so it is left out of the bundle`)
      continue
    }
    assets[path] = content
  }
  for (const path of binary)
    warn(
      path,
      'Binary files are not bundled yet; embed images in the SVG icon or Markdown as data URLs'
    )

  /** @type {Record<string, string>} */
  const modules = {}
  for (const path of graph.order) if (graph.modules[path]) modules[path] = graph.modules[path].code

  const body = {
    format: BUNDLE_FORMAT,
    manifest,
    icon,
    modules,
    entry: manifest.entry ?? null,
    assets,
  }
  /** @type {ComponentBundle} */
  const bundle = { ...body, integrity: bundleIntegrity(body) }
  const fileName = `${name || String(manifest.id).split(/[.:/]/).pop()}.strata.js`
  const script = componentScript(bundle, fileName)
  if (script.length > MAX_BUNDLE_BYTES)
    warn(
      fileName,
      `The bundle is ${(script.length / 1048576).toFixed(1)} MB; large bundles slow down opening projects`
    )
  return { bundle, script, fileName, problems }
}

/**
 * The `.strata.js` text for a bundle: one call to `Strata.registerComponent` with the bundle
 * as JSON, so it loads as a classic script and can also be read without evaluating it.
 * @param {ComponentBundle} bundle
 * @param {string} [fileName]
 */
export function componentScript(bundle, fileName = 'component.strata.js') {
  const { id, version } = bundle.manifest
  return `// ${fileName} (generated by strata pack; do not edit)\n// ${id}@${version} · ${bundle.integrity}\n${SCRIPT_CALL}${JSON.stringify(bundle, null, 2)})\n`
}

/**
 * Reads a bundle from a `.strata.js` script, JSON text or an object, checks its shape and
 * integrity, and returns it. Nothing is evaluated.
 * @param {string|object} input
 * @returns {ComponentBundle}
 */
export function readBundle(input) {
  let bundle = input
  if (typeof input === 'string') {
    const text = input.trim()
    const at = text.indexOf(SCRIPT_CALL)
    let json = text
    if (at >= 0) {
      json = text.slice(at + SCRIPT_CALL.length).replace(/\)\s*;?\s*$/, '')
    }
    try {
      bundle = JSON.parse(json)
    } catch {
      throw new StrataError(
        'INVALID',
        'This is not a packed component: expected a .strata.js file made by strata pack'
      )
    }
  }
  const b = /** @type {Record<string, any>} */ (bundle)
  const problems = []
  if (!b || typeof b !== 'object')
    throw new StrataError('INVALID', 'A component bundle must be an object')
  if (b.format !== BUNDLE_FORMAT) problems.push(`format must be '${BUNDLE_FORMAT}'`)
  if (!b.manifest || typeof b.manifest !== 'object') problems.push('manifest is missing')
  if (b.icon !== null && typeof b.icon !== 'string') problems.push('icon must be SVG text or null')
  if (b.entry !== null && typeof b.entry !== 'string')
    problems.push('entry must be a module path or null')
  for (const key of ['modules', 'assets']) {
    if (
      !b[key] ||
      typeof b[key] !== 'object' ||
      Object.values(b[key]).some(v => typeof v !== 'string')
    )
      problems.push(`${key} must map paths to text`)
  }
  if (b.entry && b.modules && !(b.entry in b.modules))
    problems.push(`the entry '${b.entry}' is not among the modules`)
  if (typeof b.integrity !== 'string') problems.push('integrity is missing')
  if (problems.length)
    throw new StrataError('INVALID', `Invalid component bundle: ${problems.join('; ')}`, problems)
  const expected = bundleIntegrity(/** @type {ComponentBundle} */ (b))
  if (expected !== b.integrity) {
    throw new StrataError(
      'INVALID',
      `The bundle for ${b.manifest.id}@${b.manifest.version} was changed after it was packed (integrity mismatch). Pack it again with strata pack.`
    )
  }
  return /** @type {ComponentBundle} */ (b)
}

/**
 * The manifest to register for a bundle: as authored, plus the icon markup.
 * @param {ComponentBundle} bundle
 * @returns {Record<string, any>}
 */
export function manifestOfBundle(bundle) {
  return bundle.icon ? { ...bundle.manifest, iconSvg: bundle.icon } : { ...bundle.manifest }
}

/**
 * Throws when packing reported errors; the message lists every problem.
 * @param {PackResult} result
 * @returns {ComponentBundle}
 */
export function requireBundle(result) {
  const errors = result.problems.filter(p => p.level === 'error')
  if (errors.length || !result.bundle) {
    throw new StrataError(
      'INVALID',
      `The component could not be packed:\n${errors.map(formatProblem).join('\n')}`,
      errors
    )
  }
  return result.bundle
}
