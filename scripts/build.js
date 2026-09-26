#!/usr/bin/env node
// Builds the offline app with the in-house bundler (spec §4 "Build"):
//
//   dist/strata.js        classic script defining the global `Strata` (app, facade, workspace)
//   dist/strata.cjs       CommonJS build of the facade for Node: require('./dist/strata.cjs')
//   dist/strata.html      the offline app: open it from disk, no server needed
//   dist/components/      the starter library, packed, one script tag each in strata.html
//   dist/sim-worker.js    the simulation worker's source as a string (StrataSimWorker.source),
//                         so a file:// page can start it from a Blob URL
//   dist/vendor/          D3 as shipped, Three.js bundled to a classic script (THREE), and their
//                         licences
//
//   node scripts/build.js [--out dist] [--no-minify]
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import {
  bundleModules,
  emitScript,
  formatProblem,
  minify as minifyCode,
} from '../packages/plugins/src/index.js'
import { componentFolders, packFolder } from '../packages/server/src/index.js'
import { BEGIN_MARKER, END_MARKER } from '../packages/cli/src/index.js'
import { ENGINE_VERSION, PROTOCOL_VERSION } from '../packages/sim/src/index.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STARTER = [join(ROOT, 'components'), join(ROOT, 'connection-types')]
/** Spec §19: core + UI under 600 KB minified, excluding D3. */
const BUDGET = 600 * 1024

/** Every JavaScript file the bundles may reach, keyed by repository path. */
async function sources() {
  /** @type {Record<string, string>} */
  const files = {}
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name.endsWith('.js'))
        files[relative(ROOT, path).split(sep).join('/')] = await readFile(path, 'utf8')
    }
  }
  for (const pkg of await readdir(join(ROOT, 'packages'))) {
    try {
      await walk(join(ROOT, 'packages', pkg, 'src'))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
  await walk(join(ROOT, 'app'))
  return files
}

/**
 * @param {Record<string, string>} files
 * @param {string} entry
 * @param {{ format: 'iife'|'cjs', globalName?: string, minify: boolean, banner: string }} options
 */
function script(files, entry, { format, globalName, minify, banner }) {
  const bundle = bundleModules(files, [entry])
  const errors = bundle.problems.filter(p => p.level === 'error')
  if (errors.length)
    throw new Error(`Cannot bundle ${entry}:\n${errors.map(formatProblem).join('\n')}`)
  let code = emitScript(bundle, { entry, format, globalName })
  if (minify) code = minifyCode(code)
  code = `${banner}\n${code}`
  // A syntax check of the output, so a bundler bug fails the build rather than the page.

  new Script(code, { filename: basename(entry) })
  return { code, modules: bundle.order.length }
}

/**
 * Vendored Three.js (eng §3): its ES modules bundled to a classic script that defines `THREE`,
 * with the copyright and licence the minifier would otherwise strip.
 * @param {boolean} minify
 */
async function threeScript(minify) {
  const dir = join(ROOT, 'vendor/three')
  const files = {
    'three.module.js': await readFile(join(dir, 'three.module.js'), 'utf8'),
    'three.core.js': await readFile(join(dir, 'three.core.js'), 'utf8'),
  }
  const { version, licence } = JSON.parse(
    await readFile(join(ROOT, 'vendor/manifest.json'), 'utf8')
  ).libraries.three
  const copyright = /Copyright .+/.exec(await readFile(join(dir, 'LICENSE'), 'utf8'))?.[0]
  const banner = `/*! three.js ${version} · ${copyright} · ${licence} licence: LICENSE-three · bundled by the Strata bundler */`
  return script(files, 'three.module.js', { format: 'iife', globalName: 'THREE', minify, banner })
}

/** The simulation worker's entry (eng §13), bundled with everything it imports. */
export const SIM_WORKER_ENTRY = 'packages/sim/src/worker/main.js'

/**
 * The simulation worker as one classic script. The app starts it from a Blob URL, and Node runs
 * it in worker_threads.
 * @param {{ minify?: boolean }} [options]
 */
export async function simWorkerSource({ minify = true } = {}) {
  const banner = '/*! Strata simulation worker · built with the Strata bundler */'
  return script(await sources(), SIM_WORKER_ENTRY, { format: 'iife', minify, banner }).code
}

const html = scripts => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Strata</title>
<style>
  html, body { margin: 0; height: 100%; }
  strata-app { height: 100vh; }
  noscript { display: block; padding: 2rem; font: 15px system-ui, sans-serif; }
</style>
<script src="vendor/d3.min.js"></script>
<script src="strata.js"></script>
</head>
<body data-strata-app>
<noscript>Strata needs JavaScript.</noscript>
${BEGIN_MARKER} - one line per packed component; strata pack --install strata.html adds lines -->
${scripts.map(src => `<script src="${src}"></script>`).join('\n')}
${END_MARKER}
</body>
</html>
`

/**
 * @param {{ out?: string, minify?: boolean, components?: string[], log?: (line: string) => void }} [options]
 */
export async function build({
  out = join(ROOT, 'dist'),
  minify = true,
  components = STARTER,
  log = console.log,
} = {}) {
  const outDir = resolve(out)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(join(outDir, 'components'), { recursive: true })
  await mkdir(join(outDir, 'vendor'), { recursive: true })

  const files = await sources()
  const version = JSON.parse(
    await readFile(join(ROOT, 'packages/cli/package.json'), 'utf8')
  ).version
  const banner = `/*! Strata ${version} · built with the Strata bundler · D3 is loaded separately (vendor/d3.min.js, ISC) */`
  const app = script(files, 'app/offline.js', {
    format: 'iife',
    globalName: 'Strata',
    minify,
    banner,
  })
  await writeFile(join(outDir, 'strata.js'), app.code)
  const cjs = script(files, 'packages/facade/src/index.js', { format: 'cjs', minify, banner })
  await writeFile(join(outDir, 'strata.cjs'), cjs.code)

  const scripts = []
  let failed = 0
  for (const dir of components) {
    for (const folder of await componentFolders(dir)) {
      const result = await packFolder(folder)
      if (!result.bundle || !result.script || !result.fileName) {
        failed++
        log(`✗ ${relative(ROOT, folder)}:\n${result.problems.map(formatProblem).join('\n')}`)
        continue
      }
      await writeFile(join(outDir, 'components', result.fileName), result.script)
      scripts.push(`components/${result.fileName}`)
    }
  }
  if (failed) throw new Error(`${failed} component folder(s) did not pack`)

  await cp(join(ROOT, 'vendor/d3/d3.min.js'), join(outDir, 'vendor/d3.min.js'))
  await cp(join(ROOT, 'vendor/d3/LICENSE'), join(outDir, 'vendor/LICENSE-d3'))
  const worker = await simWorkerSource({ minify })
  await writeFile(
    join(outDir, 'sim-worker.js'),
    `${banner}\nglobalThis.StrataSimWorker = Object.freeze(${JSON.stringify({ protocol: PROTOCOL_VERSION, engine: ENGINE_VERSION, source: worker })});\n`
  )
  const three = await threeScript(minify)
  await writeFile(join(outDir, 'vendor/three.js'), three.code)
  await cp(join(ROOT, 'vendor/three/LICENSE'), join(outDir, 'vendor/LICENSE-three'))
  await writeFile(join(outDir, 'strata.html'), html(scripts))

  const kb = n => `${(n / 1024).toFixed(0)} KB`
  log(
    `strata.js   ${kb(app.code.length)} (${app.modules} modules${minify ? ', minified' : ''})${app.code.length > BUDGET ? ` — over the ${kb(BUDGET)} budget` : ''}`
  )
  log(`strata.cjs  ${kb(cjs.code.length)} (${cjs.modules} modules)`)
  log(`worker      ${kb(worker.length)} (sim-worker.js)`)
  log(`three.js    ${kb(three.code.length)} (vendor/three.js, loaded lazily)`)
  log(`components  ${scripts.length} packed`)
  log(
    `Open ${relative(process.cwd(), join(outDir, 'strata.html')) || 'strata.html'} in a browser; no server needed.`
  )
  return { outDir, size: app.code.length, components: scripts.length }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const i = process.argv.indexOf('--out')
  try {
    await build({
      out: i > 0 ? process.argv[i + 1] : undefined,
      minify: !process.argv.includes('--no-minify'),
    })
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}
