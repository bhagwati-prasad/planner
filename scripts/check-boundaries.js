#!/usr/bin/env node
// Enforces the architecture rules from the spec (§4, §16):
//   - dependencies point downward only (each package may import only the packages listed below);
//   - headless code never touches the DOM or browser storage directly;
//   - code that runs in browsers never imports Node built-ins or npm packages (zero runtime
//     dependencies; vendored libraries such as D3 arrive as globals or are injected).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

/** Allowed package dependencies. Every package may import itself. */
const ALLOWED = {
  'strata-core': [],
  // Plugins build on the core's registry and manifests (spec §4).
  'strata-plugins': ['strata-core'],
  strata: ['strata-core', 'strata-plugins'],
  // The diagram library knows nothing about Strata (spec §4).
  'strata-graph': [],
  // The UI may not reach past the facade (spec §16): no strata-core.
  'strata-ui': ['strata', 'strata-graph']
}

/**
 * Code that must run unchanged in a browser, a worker and Node. strata-graph keeps its DOM
 * rendering under src/dom/; everything else in it is headless and tested in Node.
 * @type {Record<string, (relPath: string) => boolean>}
 */
const HEADLESS = {
  'strata-core': () => true,
  'strata-plugins': () => true,
  strata: () => true,
  'strata-graph': rel => !rel.split(sep).includes('dom'),
  'strata-ui': rel => !rel.split(sep).includes('elements')
}

/** Packages whose sources load in browsers: relative imports only. */
const BROWSER = new Set(['strata-core', 'strata-plugins', 'strata', 'strata-graph', 'strata-ui'])

const DOM_GLOBALS = [
  'document', 'window', 'localStorage', 'sessionStorage', 'indexedDB',
  'HTMLElement', 'customElements', 'navigator', 'location'
]

function walk (dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.endsWith('.js')) out.push(path)
  }
  return out
}

/** Removes comments and string/template contents so identifier checks ignore them. */
function stripCode (src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

const IMPORT_RE = /\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g

const problems = []
const packages = readdirSync(packagesDir).filter(name => statSync(join(packagesDir, name)).isDirectory())

for (const pkg of packages) {
  if (!(pkg in ALLOWED)) {
    problems.push(`packages/${pkg}: not listed in scripts/check-boundaries.js ALLOWED map`)
    continue
  }
  const srcDir = join(packagesDir, pkg, 'src')
  let files = []
  try { files = walk(srcDir) } catch { continue }
  for (const file of files) {
    const rel = relative(root, file)
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3]
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec)
        const inPackages = relative(packagesDir, target)
        const targetPkg = inPackages.split(sep)[0]
        if (inPackages.startsWith('..')) {
          problems.push(`${rel}: imports '${spec}' from outside packages/`)
        } else if (targetPkg !== pkg && !ALLOWED[pkg].includes(targetPkg)) {
          problems.push(`${rel}: '${pkg}' may not depend on '${targetPkg}' (imports '${spec}')`)
        }
      } else if (BROWSER.has(pkg)) {
        problems.push(`${rel}: '${pkg}' runs in browsers and imports '${spec}'; only relative imports are allowed`)
      }
    }
    if (HEADLESS[pkg]?.(relative(srcDir, file))) {
      const code = stripCode(src)
      for (const name of DOM_GLOBALS) {
        const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g')
        if (re.test(code)) problems.push(`${rel}: headless code references the browser global '${name}'`)
      }
    }
  }
}

if (problems.length) {
  console.error(`Boundary check failed (${problems.length}):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Boundary check passed for ${packages.length} package(s).`)
