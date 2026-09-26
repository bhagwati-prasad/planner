/**
 * Manifest validation for plugin authors (spec §7 "Manifest"). The core's `normalizeManifest`
 * decides what the model accepts; this adds what a packed plugin must also get right (an API
 * range, files it names, units, known keys) and reports everything at once, as errors and
 * warnings, so `strata validate` and the upload dialog can show the whole list.
 */
import { normalizeManifest, suggest, StrataError, PLUGIN_KINDS } from '../../strata-core/src/index.js'

export { PLUGIN_KINDS }

export const MANIFEST_KEYS = Object.freeze([
  'strataApi', 'kind', 'id', 'name', 'version', 'category', 'description', 'icon', 'entry', 'extends',
  'abstract', 'shape', 'ports', 'properties', 'metrics', 'templates', 'migrations',
  'author', 'license', 'homepage', 'keywords', 'tags'
])

/** Property types whose values carry a unit of their own ("250ms", "10MB", "500/s"). */
const SELF_DESCRIBING = new Set(['duration', 'bytes', 'rate', 'percent', 'boolean', 'string', 'enum', 'list', 'map', 'ref'])

/**
 * @typedef {import('./bundle.js').Problem} Problem
 */

/**
 * Checks a manifest. With `files` (the plugin folder's paths), also checks that the files it
 * names exist.
 * @param {unknown} manifest parsed manifest.json
 * @param {{ files?: Iterable<string>, file?: string }} [options]
 * @returns {Problem[]}
 */
export function validateManifest (manifest, { files, file = 'manifest.json' } = {}) {
  /** @type {Problem[]} */
  const problems = []
  const error = message => problems.push({ level: 'error', file, message })
  const warn = message => problems.push({ level: 'warning', file, message })

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    error('The manifest must be a JSON object')
    return problems
  }
  const m = /** @type {Record<string, any>} */ (manifest)

  try {
    normalizeManifest(m)
  } catch (err) {
    if (!(err instanceof StrataError)) throw err
    const details = Array.isArray(err.details) ? err.details : [err.message]
    for (const d of details) error(d)
  }

  if (m.strataApi === undefined) error('strataApi is required: the range of plugin API versions this plugin works with, e.g. "^1.0"')
  if (typeof m.id === 'string' && m.id.startsWith('base:')) error("ids starting with 'base:' are reserved for the built-in base types; use your own prefix, e.g. 'acme.queue'")
  if (typeof m.id === 'string' && !m.id.includes('.') && !m.id.startsWith('base:')) warn(`id '${m.id}' has no namespace; prefix it with your organisation, e.g. 'acme.${m.id}', so it cannot clash with other plugins`)
  const kind = m.kind ?? 'component'

  for (const key of Object.keys(m)) {
    if (MANIFEST_KEYS.includes(key)) continue
    const close = suggest(key, MANIFEST_KEYS, 1)
    warn(`Unknown key '${key}'${close.length ? `. Did you mean '${close[0]}'?` : ' (ignored)'}`)
  }

  if (m.properties && typeof m.properties === 'object') {
    for (const [key, schema] of Object.entries(m.properties)) {
      if (!schema || typeof schema !== 'object') continue
      if (!SELF_DESCRIBING.has(schema.type) && !schema.unit) {
        warn(`properties.${key}: a ${schema.type} needs an explicit unit (spec §7), e.g. "unit": "ms", "messages" or "count"`)
      }
    }
  }

  if (m.metrics && typeof m.metrics === 'object') {
    for (const [key, metric] of Object.entries(m.metrics)) {
      if (metric && typeof metric === 'object' && !metric.unit) warn(`metrics.${key}: add a unit, e.g. "unit": "req/s"`)
    }
  }

  if (!m.extends && !m.entry && !m.abstract && kind === 'component') {
    warn('The component has neither "extends" nor "entry", so it has no behaviour in simulation. Extend a base type (e.g. "base:service") or add an entry module')
  }

  if (files) {
    const present = new Set(files)
    const need = (path, what) => {
      if (typeof path !== 'string' || !path) { error(`${what} must be a file path`); return }
      if (!present.has(path)) {
        const close = suggest(path, present, 1)
        error(`${what} '${path}' is not in the folder${close.length ? `. Did you mean '${close[0]}'?` : ''}`)
      }
    }
    if (m.icon !== undefined && m.icon !== null) {
      need(m.icon, 'icon')
      if (typeof m.icon === 'string' && !m.icon.endsWith('.svg')) error('icon must be an SVG file')
    } else warn('No icon; the library shows the base shape. Add "icon": "icon.svg"')
    if (m.entry !== undefined && m.entry !== null) {
      need(m.entry, 'entry')
      if (typeof m.entry === 'string' && !m.entry.endsWith('.js')) error('entry must be a JavaScript module (.js)')
    }
    if (m.templates !== undefined) {
      if (!m.templates || typeof m.templates !== 'object') error('templates must be an object such as { "docs": ["templates/runbook.md"] }')
      else {
        for (const [group, list] of Object.entries(m.templates)) {
          if (!Array.isArray(list)) { error(`templates.${group} must be a list of files`); continue }
          for (const path of list) need(path, `templates.${group}`)
        }
      }
    }
    if (m.migrations !== undefined) {
      if (!m.migrations || typeof m.migrations !== 'object') error('migrations must map a version range to a module, e.g. { "1.x": "migrations/v1-to-v2.js" }')
      else {
        for (const [range, path] of Object.entries(m.migrations)) {
          need(path, `migrations['${range}']`)
          if (typeof path === 'string' && !path.endsWith('.js')) error(`migrations['${range}'] must be a JavaScript module`)
        }
      }
    }
  }
  return problems
}

/**
 * Checks an icon's markup. The renderer sanitises icons anyway (strata-graph keeps drawing
 * elements only); these warnings tell authors what will be dropped.
 * @param {string} svg
 * @param {string} [file]
 * @returns {Problem[]}
 */
export function checkIcon (svg, file = 'icon.svg') {
  /** @type {Problem[]} */
  const problems = []
  const text = svg.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim()
  if (!/^<svg[\s>]/i.test(text)) problems.push({ level: 'error', file, message: 'The icon is not an SVG document' })
  if (svg.length > 64 * 1024) problems.push({ level: 'warning', file, message: `The icon is ${Math.round(svg.length / 1024)} KB; keep icons under 64 KB` })
  if (/<script/i.test(text)) problems.push({ level: 'warning', file, message: 'The icon contains a script, which will be removed' })
  if (/\son[a-z]+\s*=/i.test(text)) problems.push({ level: 'warning', file, message: 'The icon has event handler attributes, which will be removed' })
  if (/(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(text)) problems.push({ level: 'warning', file, message: 'The icon links to external resources, which will be removed; icons must be self-contained' })
  if (!/viewBox\s*=/i.test(text)) problems.push({ level: 'warning', file, message: 'The icon has no viewBox, so it may not scale; add viewBox="0 0 24 24"' })
  return problems
}
