#!/usr/bin/env node
// @ts-check
// Runs every Node test file with Node's built-in test runner:
//   packages/*/test/**/*.test.js   package tests
//   tools/**/test/**/*.test.js     tests of the tools (bundler, lint rules, this scaffold)
//   components/*/tests/**/*.test.js  component self-tests
// Listing files explicitly keeps helpers and fixtures out of the run and works on Node 20+.
//
//   node scripts/run-tests.js [filter...] [--root <dir>] [--list]
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** @param {string} path */
const isDir = path => existsSync(path) && statSync(path).isDirectory()

/**
 * Test files under `dir`, recursively (node_modules and dot-folders skipped).
 * @param {string} dir
 * @param {string[]} [out]
 */
function testFilesIn (dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) testFilesIn(path, out)
    else if (name.endsWith('.test.js')) out.push(path)
  }
  return out
}

/**
 * The folders named `test` anywhere under `dir` (node_modules and dot-folders skipped).
 * @param {string} dir
 * @param {string[]} [out]
 */
function testFolders (dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (!statSync(path).isDirectory()) continue
    if (name === 'test') out.push(path)
    else testFolders(path, out)
  }
  return out
}

/**
 * Every test file of the repository at `root`, sorted, as absolute paths.
 * @param {string} root
 */
export function findTestFiles (root) {
  const dirs = []
  const children = (/** @type {string} */ dir) => (isDir(dir) ? readdirSync(dir).map(name => join(dir, name)).filter(isDir) : [])
  for (const pkg of children(join(root, 'packages'))) if (isDir(join(pkg, 'test'))) dirs.push(join(pkg, 'test'))
  if (isDir(join(root, 'tools'))) dirs.push(...testFolders(join(root, 'tools')))
  for (const component of children(join(root, 'components'))) if (isDir(join(component, 'tests'))) dirs.push(join(component, 'tests'))
  return [...new Set(dirs.flatMap(dir => testFilesIn(dir)))].sort()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--root')
  const root = at >= 0 ? resolve(args[at + 1]) : fileURLToPath(new URL('..', import.meta.url))
  const list = args.includes('--list')
  const filters = args.filter((arg, i) => !arg.startsWith('--') && !(at >= 0 && i === at + 1))
  const files = findTestFiles(root).filter(file => filters.length === 0 || filters.some(f => file.includes(f)))
  const shown = files.map(f => relative(root, f).split(sep).join('/'))

  if (files.length === 0) {
    console.error('No test files found.')
    process.exit(1)
  }
  if (list) {
    console.log(shown.join('\n'))
    process.exit(0)
  }
  console.log(`Running ${files.length} test file(s):\n  ${shown.join('\n  ')}\n`)
  // A parent test runner's context would redirect the report; drop it.
  const { NODE_TEST_CONTEXT, ...env } = process.env
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: root, env })
  process.exit(result.status ?? 1)
}
