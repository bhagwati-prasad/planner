#!/usr/bin/env node
// Runs every packages/*/test/browser/*.browser.js file with node:test. These drive a real
// Chromium through Playwright, which is a development tool and not a dependency: when it is
// not installed the browser tests are skipped with a note, and `npm test` still covers
// everything that runs headlessly.
import { readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findPlaywright } from './playwright.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const filter = process.argv.slice(2)
const files = readdirSync(join(root, 'packages'))
  .map(pkg => join(root, 'packages', pkg, 'test', 'browser'))
  .filter(dir => existsSync(dir))
  .flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.browser.js')).map(f => join(dir, f)))
  .filter(file => filter.length === 0 || filter.some(f => file.includes(f)))
  .sort()

if (!files.length) {
  console.log('No browser tests found.')
  process.exit(0)
}
if (!(await findPlaywright())) {
  console.log('Skipping browser tests: Playwright is not installed (npm i -g playwright, or set PLAYWRIGHT_MODULE).')
  process.exit(0)
}
console.log(`Running ${files.length} browser test file(s):\n  ${files.map(f => relative(root, f)).join('\n  ')}\n`)
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', cwd: root })
process.exit(result.status ?? 1)
