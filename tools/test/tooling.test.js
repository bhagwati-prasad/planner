// @ts-check
// Task 0002: formatting, lint and type-check tooling (eng §4, §5, §16).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURES = 'tools/test/fixtures'
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/**
 * Runs an npm script on the given paths, as `npm run <script> -- <paths>`.
 * @param {string} script
 * @param {string[]} paths
 */
function npmRun(script, paths) {
  const run = spawnSync('npm', ['run', '--silent', script, '--', ...paths], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return { status: run.status, output: `${run.stdout}${run.stderr}` }
}

describe('npm run format:check', () => {
  it('accepts a fixture formatted to eng §5', () => {
    const run = npmRun('format:check', [`${FIXTURES}/format/good.js`])
    assert.equal(run.status, 0, run.output)
  })

  it('fails a fixture with bad formatting and names the file', () => {
    const run = npmRun('format:check', [`${FIXTURES}/format/bad.js`])
    assert.notEqual(run.status, 0)
    assert.match(run.output, /format\/bad\.js/)
    assert.match(run.output, /Code style issues/)
  })
})

describe('npm run lint', () => {
  it('accepts a fixture that uses const, === and == null', () => {
    const run = npmRun('lint', [`${FIXTURES}/lint/good.js`])
    assert.equal(run.status, 0, run.output)
  })

  it('fails a fixture using var or ==, naming both rules', () => {
    const run = npmRun('lint', [`${FIXTURES}/lint/bad.js`])
    assert.notEqual(run.status, 0)
    assert.match(run.output, /no-var/)
    assert.match(run.output, /eqeqeq/)
  })
})

describe('npm run typecheck', () => {
  it('accepts a fixture whose JSDoc types hold', () => {
    const run = npmRun('typecheck', [`${FIXTURES}/typecheck/good.js`])
    assert.equal(run.status, 0, run.output)
  })

  it('fails a fixture with a JSDoc type error, naming the file', () => {
    const run = npmRun('typecheck', [`${FIXTURES}/typecheck/bad.js`])
    assert.notEqual(run.status, 0)
    assert.match(run.output, /typecheck\/bad\.js/)
    assert.match(run.output, /TS2322|not assignable/)
  })
})

describe('dev dependencies', () => {
  const EXACT = /^\d+\.\d+\.\d+$/

  it('are only the ones eng §16 approves, pinned to exact versions', () => {
    const approved = new Set([
      'prettier',
      'eslint',
      'typescript',
      'playwright',
      '@playwright/test',
      'axe-core',
    ])
    const dev = pkg.devDependencies ?? {}
    assert.ok(Object.keys(dev).length > 0, 'devDependencies are declared')
    for (const [name, version] of Object.entries(dev)) {
      assert.ok(approved.has(name), `${name} is not on the approved list`)
      assert.match(version, EXACT, `${name} is pinned to an exact version`)
    }
  })

  it('are locked in package-lock.json at the same exact versions', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))
    assert.ok(lock.lockfileVersion >= 3)
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      assert.equal(lock.packages[''].devDependencies?.[name], version)
      assert.equal(
        lock.packages[`node_modules/${name}`]?.version,
        version,
        `${name} in the lockfile`
      )
    }
  })

  it('install with npm ci --ignore-scripts from the lockfile alone', () => {
    // A copy of the workspace manifests, installed from the npm cache so the test needs no network.
    const dir = mkdtempSync(join(tmpdir(), 'strata-ci-'))
    try {
      cpSync(join(ROOT, 'package.json'), join(dir, 'package.json'))
      cpSync(join(ROOT, 'package-lock.json'), join(dir, 'package-lock.json'))
      for (const name of readdirSync(join(ROOT, 'packages'))) {
        mkdirSync(join(dir, 'packages', name), { recursive: true })
        cpSync(
          join(ROOT, 'packages', name, 'package.json'),
          join(dir, 'packages', name, 'package.json')
        )
      }
      const run = spawnSync(
        'npm',
        ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
        { cwd: dir, encoding: 'utf8' }
      )
      assert.equal(run.status, 0, run.stdout + run.stderr)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('npm scripts', () => {
  it('provide format, format:check, lint and typecheck', () => {
    for (const script of ['format', 'format:check', 'lint', 'typecheck']) {
      assert.equal(pkg.scripts[script], `node tools/checks.js ${script}`)
    }
  })
})
