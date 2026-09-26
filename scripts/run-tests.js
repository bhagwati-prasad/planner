#!/usr/bin/env node
// Runs every packages/*/test/**/*.test.js file with Node's built-in test runner.
// Listing files explicitly keeps helpers and fixtures out of the run and works on Node 20+.
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const filter = process.argv.slice(2)

function walk (dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.endsWith('.test.js')) out.push(path)
  }
  return out
}

const packagesDir = join(root, 'packages')
const files = readdirSync(packagesDir)
  .map(name => join(packagesDir, name, 'test'))
  .filter(dir => { try { return statSync(dir).isDirectory() } catch { return false } })
  .flatMap(dir => walk(dir))
  .filter(file => filter.length === 0 || filter.some(f => file.includes(f)))
  .sort()

if (files.length === 0) {
  console.error('No test files found.')
  process.exit(1)
}

console.log(`Running ${files.length} test file(s):\n  ${files.map(f => relative(root, f)).join('\n  ')}\n`)
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: root })
process.exit(result.status ?? 1)
