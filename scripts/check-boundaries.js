#!/usr/bin/env node
// Enforces the architecture rules from the spec (§4, §16):
//   - dependencies point downward only (each package may import only the packages listed below);
//   - headless packages never touch the DOM or browser storage directly;
//   - browser-capable packages never import Node built-ins or npm packages (zero runtime dependencies).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

/** Allowed package dependencies. Every package may import itself. */
const ALLOWED = {
  'strata-core': [],
  strata: ['strata-core']
}

/** Packages that must run unchanged in a browser, a worker and Node. */
const HEADLESS = new Set(['strata-core', 'strata'])

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
      } else if (HEADLESS.has(pkg)) {
        problems.push(`${rel}: headless package imports '${spec}'; only relative imports are allowed`)
      }
    }
    if (HEADLESS.has(pkg)) {
      const code = stripCode(src)
      for (const name of DOM_GLOBALS) {
        const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g')
        if (re.test(code)) problems.push(`${rel}: headless package references the browser global '${name}'`)
      }
    }
  }
}

if (problems.length) {
  console.error(`Boundary check failed (${problems.length}):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Boundary check passed for ${packages.length} package(s).`)
