#!/usr/bin/env node
// The browser gate: Playwright specs first (playwright.config.js: every browser, served and
// file://), then the older packages/*/test/browser/*.browser.js files, which drive Chromium
// through node:test until their packages' tasks move them to specs.
//
//   node scripts/run-browser-tests.js [filter...]
//
// STRATA_BROWSERS=chromium limits the Playwright run to the browsers installed locally.
import { readdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const filter = process.argv.slice(2)
const playwright = createRequire(import.meta.url).resolve('@playwright/test/cli')

const specs = spawnSync(
  process.execPath,
  [playwright, 'test', ...(filter.length ? ['--pass-with-no-tests', ...filter] : [])],
  { stdio: 'inherit', cwd: root }
)
if (specs.status !== 0) process.exit(specs.status ?? 1)

const files = readdirSync(join(root, 'packages'))
  .map(pkg => join(root, 'packages', pkg, 'test', 'browser'))
  .filter(dir => existsSync(dir))
  .flatMap(dir =>
    readdirSync(dir)
      .filter(f => f.endsWith('.browser.js'))
      .map(f => join(dir, f))
  )
  .filter(file => filter.length === 0 || filter.some(f => file.includes(f)))
  .sort()

if (!files.length) process.exit(0)
console.log(
  `\nRunning ${files.length} node:test browser file(s) in Chromium:\n  ${files.map(f => relative(root, f)).join('\n  ')}\n`
)
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit',
  cwd: root,
})
process.exit(result.status ?? 1)
