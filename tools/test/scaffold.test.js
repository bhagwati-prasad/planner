// @ts-check
// Task 0001: the repository layout of eng §3 and the test discovery behind `npm test`.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const RUNNER = join(ROOT, 'scripts/run-tests.js')

/** Package names from the layout block of eng §3, the source of truth for the package list. */
function packagesFromGuideline () {
  const text = readFileSync(join(ROOT, 'docs/guidelines/engineering/03-repository-layout.md'), 'utf8')
  const block = /```\n(strata\/[\s\S]*?)```/.exec(text)?.[1] ?? ''
  const lines = block.split('\n')
  const start = lines.findIndex(line => line.trim() === 'packages/')
  const names = []
  for (const line of lines.slice(start + 1)) {
    const match = /^ {4}([a-z0-9-]+)\/\s/.exec(line)
    if (!match) break
    names.push(match[1])
  }
  return names
}

describe('repository scaffold', () => {
  it('reads the fifteen packages of eng §3', () => {
    assert.deepEqual(packagesFromGuideline(), [
      'core', 'facade', 'plugins', 'sim', 'debug', 'test', 'docs', 'plan', 'comments', 'storage', 'graph', '3d', 'ui', 'cli', 'server'
    ])
  })

  it('has every package listed in eng §3, each with src/index.js, test/, README.md and package.json', () => {
    const missing = []
    for (const name of packagesFromGuideline()) {
      const dir = join(ROOT, 'packages', name)
      for (const entry of ['src/index.js', 'README.md', 'package.json']) {
        if (!existsSync(join(dir, entry))) missing.push(`packages/${name}/${entry}`)
      }
      if (!existsSync(join(dir, 'test')) || !statSync(join(dir, 'test')).isDirectory()) missing.push(`packages/${name}/test/`)
    }
    assert.deepEqual(missing, [])
  })

  it('has no other packages than the ones eng §3 lists', () => {
    const listed = new Set(packagesFromGuideline())
    const extra = readdirSync(join(ROOT, 'packages')).filter(name => statSync(join(ROOT, 'packages', name)).isDirectory() && !listed.has(name))
    assert.deepEqual(extra, [])
  })

  it('declares no dependencies in any package.json under packages/', () => {
    const declaring = []
    for (const name of readdirSync(join(ROOT, 'packages'))) {
      const file = join(ROOT, 'packages', name, 'package.json')
      if (!existsSync(file)) continue
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      if ('dependencies' in pkg) declaring.push(`packages/${name}`)
    }
    assert.deepEqual(declaring, [])
  })

  it('makes every package private and an ES module', () => {
    const wrong = []
    for (const name of packagesFromGuideline()) {
      const file = join(ROOT, 'packages', name, 'package.json')
      if (!existsSync(file)) { wrong.push(`packages/${name}: no package.json`); continue }
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      if (pkg.private !== true) wrong.push(`packages/${name}: not private`)
      if (pkg.type !== 'module') wrong.push(`packages/${name}: not "type": "module"`)
    }
    assert.deepEqual(wrong, [])
  })
})

describe('npm test', () => {
  /** @type {string} */
  let fixture

  /** Writes a file in the fixture tree. @param {string} path @param {string} text */
  const write = (path, text) => {
    mkdirSync(dirname(join(fixture, path)), { recursive: true })
    writeFileSync(join(fixture, path), text)
  }
  const passing = "import { it } from 'node:test'\nit('passes', () => {})\n"

  before(() => {
    fixture = mkdtempSync(join(tmpdir(), 'strata-runner-'))
    write('packages/core/test/model.test.js', passing)
    write('packages/core/test/helpers/fixtures.js', 'export const x = 1\n')
    write('tools/test/scaffold.test.js', passing)
    write('tools/bundler/test/bundle.test.js', passing)
    write('components/message-queue/tests/queue.test.js', passing)
    write('components/message-queue/index.js', 'export default {}\n')
    write('node_modules/some-package/test/ignored.test.js', "throw new Error('node_modules must not be run')\n")
  })

  after(() => rmSync(fixture, { recursive: true, force: true }))

  it('runs the test runner', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.test, 'node scripts/run-tests.js')
  })

  it('discovers tests under packages/*/test, tools/**/test and components/*/tests and exits 0', () => {
    const run = spawnSync(process.execPath, [RUNNER, '--root', fixture, '--list'], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const found = run.stdout.trim().split('\n').map(line => line.trim()).filter(Boolean).sort()
    assert.deepEqual(found, [
      'components/message-queue/tests/queue.test.js',
      'packages/core/test/model.test.js',
      'tools/bundler/test/bundle.test.js',
      'tools/test/scaffold.test.js'
    ])
    const tests = spawnSync(process.execPath, [RUNNER, '--root', fixture], { encoding: 'utf8' })
    assert.equal(tests.status, 0, tests.stdout + tests.stderr)
    assert.match(tests.stdout, /# pass 4/)
  })

  it('exits non-zero when a discovered test fails', () => {
    write('components/broken/tests/broken.test.js', "import { it } from 'node:test'\nit('fails', () => { throw new Error('no') })\n")
    try {
      const run = spawnSync(process.execPath, [RUNNER, '--root', fixture], { encoding: 'utf8' })
      assert.notEqual(run.status, 0)
      assert.match(run.stdout, /not ok \d+ - fails/, 'the failing test was run, not skipped')
    } finally {
      rmSync(join(fixture, 'components/broken'), { recursive: true, force: true })
    }
  })

  it('finds this file in the real repository', () => {
    const run = spawnSync(process.execPath, [RUNNER, '--list'], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.ok(run.stdout.split('\n').map(l => l.trim()).includes(relative(ROOT, fileURLToPath(import.meta.url)).split('\\').join('/')))
  })
})
