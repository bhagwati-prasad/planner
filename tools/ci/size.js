#!/usr/bin/env node
// @ts-check
// The bundle-size gate (eng §15). The budgets are read from the guideline's table, so changing
// a budget (through an ADR) changes the check. Code is measured the way the build ships it:
// each source file minified by packages/plugins' minifier, summed per budget. KB means 1,000
// bytes.
//
//   node tools/ci/size.js
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleModules, emitScript, minify } from '../../packages/plugins/src/index.js'
import { NODE_PACKAGES } from '../lint/guidelines.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ENG15 = join(ROOT, 'docs/guidelines/engineering/15-performance-budgets.md')
const EXCEPTIONS = join(ROOT, 'tools/ci/size-exceptions.json')
export const KB = 1000

/** Packages with their own budget or none: the view layers. D3 and Three.js are excluded (eng §15). */
const VIEW_PACKAGES = new Set(['graph', '3d', 'ui'])
/** The console help metadata, generated from the facade's JSDoc, with a budget of its own (ADR 0013). */
const HELP_DATA = join('packages', 'facade', 'src', 'help-data.js')

/**
 * @typedef {object} Budget
 * @property {string} label  the eng §15 row, e.g. 'strata-graph (minified)'
 * @property {number} bytes
 *
 * @typedef {object} Exception  a budget that existing code already exceeds, owned by a later task
 * @property {number} bytes     the most the measure may reach until that task lands
 * @property {string} owner     the task id that brings it within budget
 *
 * @typedef {object} Row
 * @property {string} label
 * @property {number} budget
 * @property {number|null} bytes  null when nothing is built for this budget yet
 * @property {Exception|undefined} exception
 */

/** The size rows of the eng §15 table: every budget given in KB. @returns {Budget[]} */
export function budgets() {
  return [...readFileSync(ENG15, 'utf8').matchAll(/^\|\s*([^|]+?)\s*\|\s*([\d,]+) KB\s*\|$/gm)].map(
    ([, label, kb]) => ({ label, bytes: Number(kb.replace(/,/g, '')) * KB })
  )
}

/** Every file under `dir` with the extension, in a stable order. @param {string} dir @param {string} ext */
function files(dir, ext) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith(ext))
    .sort()
    .map(f => join(dir, f))
}

/**
 * Minified bytes of the JavaScript under the given directories, or null when there is none.
 * @param {string[]} dirs
 * @param {(file: string) => boolean} [keep] which files count
 */
function minified(dirs, keep = () => true) {
  const all = dirs.flatMap(dir => files(dir, '.js')).filter(keep)
  if (!all.length) return null
  return all.reduce(
    (sum, f) => sum + Buffer.byteLength(minify(readFileSync(f, 'utf8'), { rename: true })),
    0
  )
}

/** Bytes of the files with the extension under the given directories, or null. @param {string[]} dirs @param {string} ext */
function raw(dirs, ext) {
  const all = dirs.flatMap(dir => files(dir, ext))
  if (!all.length) return null
  return all.reduce((sum, f) => sum + readFileSync(f).length, 0)
}

/**
 * Minified bytes of the bundle the build makes from `entry` (a path under root), or null when
 * the entry does not exist yet.
 * @param {string} root
 * @param {string} entry
 */
function bundled(root, entry) {
  if (!existsSync(join(root, entry))) return null
  /** @type {Record<string, string>} */
  const sources = {}
  for (const pkg of packages(root))
    for (const file of files(src(root, pkg), '.js'))
      sources[file.slice(root.length).replace(/\\/g, '/').replace(/^\//, '')] = readFileSync(
        file,
        'utf8'
      )
  const bundle = bundleModules(sources, [entry])
  return Buffer.byteLength(minify(emitScript(bundle, { entry, format: 'iife' }), { rename: true }))
}

/** @param {string} root */
const packages = root => {
  const dir = join(root, 'packages')
  return existsSync(dir) ? readdirSync(dir).sort() : []
}
/** @param {string} root @param {string} pkg */
const src = (root, pkg) => join(root, 'packages', pkg, 'src')

/**
 * What each eng §15 size budget measures. Node-only packages (cli, server) never reach the
 * browser and have no budget.
 * @type {Record<string, (root: string) => number|null>}
 */
export const MEASURES = {
  // strata-sim ships only in the worker bundle, which its own line measures (ADR 0018).
  'Core, facade and non-UI packages (minified)': root =>
    minified(
      packages(root)
        .filter(p => !VIEW_PACKAGES.has(p) && !NODE_PACKAGES.has(p) && p !== 'sim')
        .map(p => src(root, p)),
      file => file !== join(root, HELP_DATA)
    ),
  'strata-graph (minified)': root => minified([src(root, 'graph')]),
  'strata-ui (minified)': root => minified([src(root, 'ui')]),
  'Simulation worker bundle (minified)': root => bundled(root, 'packages/sim/src/worker/main.js'),
  'Bundled fonts (woff2, Latin subset)': root =>
    raw([join(root, 'packages', 'ui'), join(root, 'vendor')], '.woff2'),
  'Console help metadata (minified)': root =>
    existsSync(join(root, HELP_DATA))
      ? Buffer.byteLength(minify(readFileSync(join(root, HELP_DATA), 'utf8'), { rename: true }))
      : null,
}

/** @param {number} bytes */
const kb = bytes => `${(bytes / KB).toFixed(1)} KB`
/** @param {number} bytes */
const whole = bytes => `${Math.round(bytes / KB)} KB`

/**
 * Measures every eng §15 size budget.
 * @param {object} [options]
 * @param {string} [options.root]  the repository (or a fixture shaped like one)
 * @param {Record<string, Exception>} [options.exceptions]  defaults to tools/ci/size-exceptions.json
 * @returns {{ ok: boolean, rows: Row[], problems: string[] }}
 */
export function checkSizes({
  root = ROOT,
  exceptions = JSON.parse(readFileSync(EXCEPTIONS, 'utf8')),
} = {}) {
  const rows = budgets().map(({ label, bytes: budget }) => {
    const measure = MEASURES[label]
    if (!measure) throw new Error(`eng §15 budget '${label}' has no measure in tools/ci/size.js`)
    return { label, budget, bytes: measure(root), exception: exceptions[label] }
  })
  const problems = rows.map(problemOf).filter(p => p !== null)
  return { ok: problems.length === 0, rows, problems }
}

/** @param {Row} row @returns {string|null} */
function problemOf({ label, budget, bytes, exception }) {
  const size = bytes ?? 0
  if (!exception)
    return size > budget ? `${label} is ${kb(size)}, over its ${whole(budget)} budget` : null
  if (size <= budget) return `${label} is ${kb(size)}, within its budget: remove its exception`
  if (size > exception.bytes)
    return `${label} is ${kb(size)}, over the ${whole(exception.bytes)} recorded for task ${exception.owner} (budget ${whole(budget)})`
  return null
}

/** @param {Row} row */
function describe({ label, budget, bytes, exception }) {
  const size = bytes === null ? 'not built yet' : kb(bytes)
  const note = exception
    ? `, over budget until ${exception.owner} (at most ${kb(exception.bytes)})`
    : ''
  return `  ${label.padEnd(46)} ${size.padStart(13)}   budget ${whole(budget)}${note}`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, rows, problems } = checkSizes()
  console.log('Bundle sizes (eng §15, minified, 1 KB = 1,000 bytes)')
  for (const row of rows) console.log(describe(row))
  for (const problem of problems) console.error(`size: ${problem}`)
  process.exitCode = ok ? 0 : 1
}
