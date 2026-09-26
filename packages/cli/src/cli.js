/**
 * The `strata` command (spec §7 "Loading paths", §16 "Node CLI"). Node 20+, no npm
 * dependencies. `main` takes its arguments and output streams so tests can run it in process.
 *
 *   strata new component <name> [--extends base:queue] [--id acme.name] [--dir components]
 *   strata pack <dir> [--out <file>] [--watch] [--install <html>]
 *   strata pack --all [<dir>] [--install <html>]
 *   strata validate <dir>
 *   strata test-component <dir>
 *   strata serve [--port 4321] [--components <dir>]... [--root <dir>] [--no-watch]
 *   strata repl [--components <dir>]...
 */
import { mkdir, writeFile, stat, access, readdir } from 'node:fs/promises'
import { watch as watchFs } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { formatProblem } from '../../plugins/src/index.js'
import { packFolder, componentFolders, startServer } from '../../server/src/index.js'
import { scaffoldComponent, BASE_TYPES } from './scaffold.js'
import { installScriptTag } from './install.js'

export const VERSION = '0.1.0'
const REPO = fileURLToPath(new URL('../../..', import.meta.url))

/** Commands from spec §16 that later releases implement. */
const PLANNED = {
  run: 'R1 (simulation)',
  test: 'R1 (tests and architecture rules)',
  lint: 'R1 (architecture rules)',
  docs: 'R2 (documentation)',
  tickets: 'R2 (execution plan)',
  script: 'M5 (projects on disk)'
}

const USAGE = `Usage: strata <command> [options]

Components
  strata new component <name> [--extends base:service] [--id acme.name] [--dir components]
  strata pack <dir> [--out <file>] [--watch] [--install <strata.html>]
  strata pack --all [<dir>] [--install <strata.html>]
  strata validate <dir>
  strata test-component <dir>

Working
  strata serve [--port 4321] [--components <dir>]... [--root <dir>] [--no-watch]
  strata repl [--components <dir>]...

Coming later: ${Object.entries(PLANNED).map(([c, r]) => `${c} (${r})`).join(', ')}

strata help <command> shows details; strata --version prints the version.`

const HELP = {
  new: `strata new component <name> [--extends base:service] [--id acme.name] [--dir components]

Creates components/<name>/ with a manifest, an icon, a behaviour module, a README and a
self-test. --extends picks the base behaviour (base:client, base:service, base:queue,
base:topic, base:store, base:cache, base:proxy, base:timer or base:external).`,
  pack: `strata pack <dir> [--out <file>] [--watch] [--install <strata.html>]
strata pack --all [<dir>] [--install <strata.html>]

Packs a component folder into <dir>/<name>.strata.js (one self-contained script). --all packs
every folder with a manifest.json inside <dir> (default: ./components). --install adds the
script tag between the STRATA:COMPONENTS markers of an offline strata.html. --watch repacks
on every change.`,
  validate: `strata validate <dir>

Checks a component folder without writing anything: manifest, files, modules and syntax.`,
  'test-component': `strata test-component <dir>

Validates and packs the component, loads its behaviour in a sandbox to check its hooks, then
runs the self-tests in <dir>/tests with node --test.`,
  serve: `strata serve [--port 4321] [--components <dir>]... [--root <dir>] [--no-watch]

Serves the app on http://127.0.0.1:<port>/ with a strict Content Security Policy. Component
folders in each --components directory (default: ./components and ./connection-types) are
packed on the fly, served at /api/components and repacked when they change.`,
  repl: `strata repl [--components <dir>]...

An interactive Node session with \`strata\` (the console API) and every packed component
from the given directories installed.`
}

/**
 * @typedef {{ write: (text: string) => any }} Stream
 * @typedef {{ cwd?: string, stdout?: Stream, stderr?: Stream, signal?: AbortSignal }} Io
 */

/**
 * Splits argv into positionals and options. Repeated options collect into arrays.
 * @param {string[]} argv
 * @param {Record<string, 'string'|'boolean'|'list'>} spec
 */
export function parseArgs (argv, spec) {
  const positionals = []
  /** @type {Record<string, any>} */
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { positionals.push(arg); continue }
    let [name, value] = arg.slice(2).split(/=(.*)/s, 2)
    if (name.startsWith('no-') && spec[name.slice(3)] === 'boolean') { options[name.slice(3)] = false; continue }
    const type = spec[name]
    if (!type) throw new UsageError(`Unknown option --${name}`)
    if (type === 'boolean') { options[name] = true; continue }
    if (value === undefined) {
      value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new UsageError(`--${name} needs a value`)
    }
    if (type === 'list') (options[name] ??= []).push(value)
    else options[name] = value
  }
  return { positionals, options }
}

export class UsageError extends Error {}

/**
 * Runs one command.
 * @param {string[]} argv arguments after `strata`
 * @param {Io} [io]
 * @returns {Promise<number>} the exit code
 */
export async function main (argv, io = {}) {
  const cwd = io.cwd ?? process.cwd()
  const out = io.stdout ?? process.stdout
  const err = io.stderr ?? process.stderr
  const say = text => out.write(`${text}\n`)
  const complain = text => err.write(`${text}\n`)
  const [command, ...rest] = argv
  try {
    switch (command) {
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        say(rest[0] && HELP[rest[0]] ? HELP[rest[0]] : USAGE)
        return 0
      case '--version':
      case '-v':
        say(`strata ${VERSION}`)
        return 0
      case 'new': return await newCommand(rest, { cwd, say })
      case 'pack': return await packCommand(rest, { cwd, say, complain, signal: io.signal })
      case 'validate': return await validateCommand(rest, { cwd, say, complain })
      case 'test-component': return await testComponentCommand(rest, { cwd, say, complain })
      case 'serve': return await serveCommand(rest, { cwd, say, signal: io.signal })
      case 'repl': return await replCommand(rest, { cwd })
      default:
        if (PLANNED[command]) {
          complain(`strata ${command} arrives in ${PLANNED[command]}.`)
          return 2
        }
        complain(`Unknown command '${command}'.\n\n${USAGE}`)
        return 2
    }
  } catch (e) {
    if (e instanceof UsageError) {
      complain(`${e.message}\n\n${HELP[command] ?? USAGE}`)
      return 2
    }
    complain(e?.code === 'ENOENT' ? `Not found: ${e.path}` : String(e?.stack ?? e))
    return 1
  }
}

/** Prints problems relative to the working directory; returns true when there are errors. */
function report (problems, folder, { cwd, say, complain }) {
  const prefix = relative(cwd, folder).split(sep).join('/')
  for (const p of problems) {
    const line = formatProblem({ ...p, file: prefix ? `${prefix}/${p.file}` : p.file })
    if (p.level === 'error') complain(line)
    else say(line)
  }
  return problems.some(p => p.level === 'error')
}

async function requireFolder (cwd, dir) {
  if (!dir) throw new UsageError('Name the component folder')
  const path = resolve(cwd, dir)
  try {
    if (!(await stat(path)).isDirectory()) throw new UsageError(`${dir} is not a folder`)
  } catch (e) {
    if (e instanceof UsageError) throw e
    throw new UsageError(`${dir} does not exist`)
  }
  return path
}

async function newCommand (argv, { cwd, say }) {
  const { positionals, options } = parseArgs(argv, { extends: 'string', id: 'string', dir: 'string', force: 'boolean' })
  const [kind, name] = positionals
  if (kind === 'project') throw new UsageError('strata new project arrives with projects on disk (M5); create one in the app or with strata.projects.create()')
  if (kind !== 'component' || !name) throw new UsageError('Usage: strata new component <name>')
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new UsageError(`Component names are lowercase words joined by hyphens, e.g. message-queue (got '${name}')`)
  if (options.extends && !BASE_TYPES.includes(options.extends)) throw new UsageError(`--extends must be one of ${BASE_TYPES.join(', ')}`)
  const folder = resolve(cwd, options.dir ?? 'components', name)
  try {
    await access(folder)
    if (!options.force) throw new UsageError(`${relative(cwd, folder)} already exists; pick another name or pass --force`)
  } catch (e) {
    if (e instanceof UsageError) throw e
  }
  const files = scaffoldComponent(name, { extends: options.extends, id: options.id })
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true })
    await writeFile(join(folder, path), content)
  }
  const shown = relative(cwd, folder) || '.'
  say(`Created ${shown}/ (${Object.keys(files).join(', ')})`)
  say(`Next: edit ${shown}/manifest.json, then run strata pack ${shown}`)
  return 0
}

/**
 * @param {string} folder
 * @param {any} ctx
 * @param {{ out?: string, install?: string }} options
 */
async function packOne (folder, ctx, { out, install }) {
  const result = await packFolder(folder)
  const failed = report(result.problems, folder, ctx)
  if (failed || !result.bundle || !result.script || !result.fileName) {
    ctx.complain(`✗ ${relative(ctx.cwd, folder) || '.'}: not packed`)
    return null
  }
  const target = out ? resolve(ctx.cwd, out) : join(folder, result.fileName)
  await writeFile(target, result.script)
  const { id, version } = result.bundle.manifest
  ctx.say(`✓ ${id}@${version} → ${relative(ctx.cwd, target)} (${(result.script.length / 1024).toFixed(1)} KB, ${Object.keys(result.bundle.modules).length} modules)`)
  if (install) {
    const html = resolve(ctx.cwd, install)
    const changed = await installScriptTag(html, target)
    ctx.say(changed ? `  added to ${relative(ctx.cwd, html)}` : `  already in ${relative(ctx.cwd, html)}`)
  }
  return target
}

async function packCommand (argv, ctx) {
  const { positionals, options } = parseArgs(argv, { out: 'string', watch: 'boolean', install: 'string', all: 'boolean' })
  if (options.all) {
    if (options.out) throw new UsageError('--out packs one component; with --all each bundle is written into its folder')
    const dir = resolve(ctx.cwd, positionals[0] ?? 'components')
    const folders = await componentFolders(dir)
    if (!folders.length) throw new UsageError(`No component folders (with a manifest.json) in ${relative(ctx.cwd, dir) || '.'}`)
    let failed = 0
    for (const folder of folders) if (!(await packOne(folder, ctx, options))) failed++
    ctx.say(`${folders.length - failed} of ${folders.length} packed`)
    return failed ? 1 : 0
  }
  const folder = await requireFolder(ctx.cwd, positionals[0])
  const ok = await packOne(folder, ctx, options)
  if (!options.watch) return ok ? 0 : 1
  ctx.say(`Watching ${relative(ctx.cwd, folder) || '.'} (Ctrl+C to stop)`)
  let timer = null
  const watcher = watchFs(folder, { recursive: true }, (event, file) => {
    if (file && /\.strata\.js$|(^|[\\/])\./.test(String(file))) return
    clearTimeout(timer)
    timer = setTimeout(() => { packOne(folder, ctx, options).catch(e => ctx.complain(String(e))) }, 120)
  })
  await new Promise(resolve => {
    const stop = () => { watcher.close(); clearTimeout(timer); resolve(undefined) }
    ctx.signal?.addEventListener('abort', stop, { once: true })
    if (!ctx.signal) process.once('SIGINT', stop)
  })
  return 0
}

async function validateCommand (argv, ctx) {
  const { positionals } = parseArgs(argv, {})
  const folder = await requireFolder(ctx.cwd, positionals[0])
  const result = await packFolder(folder)
  const failed = report(result.problems, folder, ctx)
  const warnings = result.problems.filter(p => p.level === 'warning').length
  if (failed) {
    ctx.complain(`✗ ${relative(ctx.cwd, folder) || '.'} is not valid`)
    return 1
  }
  const { id, version } = result.bundle?.manifest ?? {}
  ctx.say(`✓ ${id}@${version} is valid${warnings ? ` (${warnings} warning${warnings > 1 ? 's' : ''})` : ''}`)
  return 0
}

async function testComponentCommand (argv, ctx) {
  const { positionals } = parseArgs(argv, {})
  const folder = await requireFolder(ctx.cwd, positionals[0])
  const result = await packFolder(folder)
  if (report(result.problems, folder, ctx) || !result.bundle) {
    ctx.complain('✗ The component does not pack; fix the errors above first')
    return 1
  }
  const { checkBehaviour } = await import('./sandbox.js')
  const behaviour = await checkBehaviour(result.bundle)
  for (const line of behaviour.messages) (behaviour.ok ? ctx.say : ctx.complain)(line)
  if (!behaviour.ok) return 1
  const tests = (await testFiles(join(folder, 'tests'))).map(f => relative(folder, f))
  if (!tests.length) {
    ctx.say('No self-tests; add tests/*.test.js (they run with node --test)')
    return 0
  }
  const code = await new Promise(resolve => {
    // A parent test runner's context would redirect the child's report; drop it.
    const { NODE_TEST_CONTEXT, ...env } = process.env
    const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...tests], { cwd: folder, env })
    child.stdout.on('data', d => ctx.say(String(d).trimEnd()))
    child.stderr.on('data', d => ctx.complain(String(d).trimEnd()))
    child.on('close', resolve)
  })
  return code === 0 ? 0 : 1
}

/** Test files (*.test.js) under `dir`, sorted. @param {string} dir @returns {Promise<string[]>} */
async function testFiles (dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true })
    return entries.filter(e => e.isFile() && /\.test\.m?js$/.test(e.name)).map(e => join(e.parentPath ?? e.path, e.name)).sort()
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
}

/** Directories that exist among the defaults. */
async function existing (cwd, dirs) {
  const out = []
  for (const dir of dirs) {
    try { if ((await stat(resolve(cwd, dir))).isDirectory()) out.push(resolve(cwd, dir)) } catch {}
  }
  return out
}

async function serveCommand (argv, { cwd, say, signal }) {
  const { options } = parseArgs(argv, { port: 'string', components: 'list', root: 'string', watch: 'boolean', host: 'string' })
  const port = Number(options.port ?? 4321)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`--port must be a port number (got ${options.port})`)
  const components = options.components ? options.components.map(d => resolve(cwd, d)) : await existing(cwd, ['components', 'connection-types'])
  const server = await startServer({
    root: options.root ? resolve(cwd, options.root) : REPO,
    port,
    host: options.host ?? '127.0.0.1',
    components,
    watch: options.watch !== false
  })
  say(`Strata is running at ${server.url}/`)
  const entries = server.catalog.entries()
  const ok = entries.filter(e => e.bundle).length
  say(`  components: ${ok} packed${entries.length - ok ? `, ${entries.length - ok} with errors (see ${server.url}/api/components)` : ''} from ${components.map(d => relative(cwd, d) || '.').join(', ') || 'no folders'}`)
  if (options.watch !== false && components.length) say('  watching for changes')
  say('Press Ctrl+C to stop.')
  await new Promise(resolve => {
    const stop = () => resolve(undefined)
    signal?.addEventListener('abort', stop, { once: true })
    if (!signal) process.once('SIGINT', stop)
  })
  await server.close()
  return 0
}

async function replCommand (argv, { cwd }) {
  const { options } = parseArgs(argv, { components: 'list' })
  const { startRepl } = await import('./repl.js')
  const dirs = options.components ? options.components.map(d => resolve(cwd, d)) : await existing(cwd, ['components', 'connection-types'])
  await startRepl({ dirs })
  return 0
}
