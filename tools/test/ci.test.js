// @ts-check
// The CI gates (task 0007): `npm run check` runs every gate in order, and the size and licence
// checks fail for the reasons eng §15 and eng §1 give.
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STEPS, runCheck } from '../ci/check.js'
import { budgets, checkSizes } from '../ci/size.js'
import { checkLicences } from '../ci/licence.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** @type {string[]} */
const made = []
after(() => made.forEach(dir => rmSync(dir, { recursive: true, force: true })))

/**
 * Builds a throwaway repository-shaped folder from a map of relative path → contents.
 * @param {Record<string, string>} files
 */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'strata-ci-'))
  made.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { root }
}

/** A module whose minified size is about `bytes`: one long string survives minification. */
const moduleOf = (/** @type {number} */ bytes) => `export const data = '${'x'.repeat(bytes)}'\n`

describe('npm run check', () => {
  it('runs format, lint, typecheck, unit tests, build, browser tests, size and licence checks in order', async () => {
    /** @type {string[]} */
    const ran = []
    const code = await runCheck({
      run: step => {
        ran.push(step.name)
        return 0
      },
      log: () => {},
    })
    assert.equal(code, 0)
    assert.deepEqual(ran, [
      'format',
      'lint',
      'typecheck',
      'unit',
      'build',
      'browser',
      'size',
      'licence',
    ])
    assert.deepEqual(
      STEPS.map(s => s.name),
      ran
    )
  })

  it('stops at the first failing gate and fails', async () => {
    /** @type {string[]} */
    const ran = []
    const code = await runCheck({
      run: step => {
        ran.push(step.name)
        return step.name === 'typecheck' ? 2 : 0
      },
      log: () => {},
    })
    assert.equal(code, 2)
    assert.deepEqual(ran, ['format', 'lint', 'typecheck'])
  })

  it('is what the npm script runs, and each gate runs the matching npm script or tool', () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(scripts.check, 'node tools/ci/check.js')
    const command = (/** @type {string} */ name) =>
      STEPS.find(s => s.name === name)?.commands.map(c => c.slice(1).join(' '))
    assert.deepEqual(command('format'), ['tools/checks.js format:check'])
    assert.deepEqual(command('typecheck'), ['tools/checks.js typecheck'])
    assert.deepEqual(command('unit'), [scripts.test.replace(/^node /, '')])
    assert.deepEqual(command('build'), [scripts.build.replace(/^node /, '')])
    assert.deepEqual(command('browser'), [scripts['test:browser'].replace(/^node /, '')])
    assert.deepEqual(command('size'), ['tools/ci/size.js'])
    assert.deepEqual(command('licence'), ['tools/ci/licence.js'])
  })
})

describe('browser tests', () => {
  it('run every spec in Chromium, Firefox and WebKit, served and from file://', async () => {
    const {
      default: config,
      browserProjects,
      selectBrowsers,
    } = await import('../../playwright.config.js')
    const all = browserProjects(selectBrowsers(undefined))
    const projects = all.map(p => ({
      name: p.name,
      browser: p.use?.browserName,
      mode: p.use?.mode,
    }))
    assert.deepEqual(projects, [
      { name: 'chromium-served', browser: 'chromium', mode: 'served' },
      { name: 'chromium-file', browser: 'chromium', mode: 'file' },
      { name: 'firefox-served', browser: 'firefox', mode: 'served' },
      { name: 'firefox-file', browser: 'firefox', mode: 'file' },
      { name: 'webkit-served', browser: 'webkit', mode: 'served' },
      { name: 'webkit-file', browser: 'webkit', mode: 'file' },
    ])
    const fileMode = all.find(p => p.name === 'chromium-file')
    assert.deepEqual(fileMode?.testMatch, ['tests/e2e/**/*.spec.js'], 'the harness needs a server')
    assert.equal(config.forbidOnly, true)
    assert.deepEqual(selectBrowsers('chromium'), ['chromium'], 'a local run may narrow them')
    assert.throws(() => selectBrowsers('chrome'), /unknown browser 'chrome'/)
  })

  it('run Playwright first in the browser gate', () => {
    const script = readFileSync(join(ROOT, 'scripts/run-browser-tests.js'), 'utf8')
    assert.match(script, /resolve\('@playwright\/test\/cli'\)/)
    const playwright = script.indexOf("[playwright, 'test'")
    const nodeTest = script.indexOf("['--test'")
    assert.ok(
      playwright > 0 && playwright < nodeTest,
      'Playwright specs run before node:test files'
    )
  })

  it('run in CI through the same npm run check, with all three browsers installed', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    const runs = [...workflow.matchAll(/^\s*(?:- )?run: (.+)$/gm)].map(m => m[1].trim())
    assert.deepEqual(runs, [
      'npm ci --ignore-scripts',
      'npx playwright install --with-deps chromium firefox webkit',
      'npm run check',
    ])
    assert.doesNotMatch(workflow, /STRATA_BROWSERS/, 'CI runs every browser')
  })
})

describe('size check', () => {
  it('reads every size budget from eng §15', () => {
    assert.deepEqual(budgets(), [
      { label: 'Core, facade and non-UI packages (minified)', bytes: 250_000 },
      { label: 'strata-graph (minified)', bytes: 60_000 },
      { label: 'strata-ui (minified)', bytes: 290_000 },
      { label: 'Simulation worker bundle (minified)', bytes: 120_000 },
      { label: 'Bundled fonts (woff2, Latin subset)', bytes: 120_000 },
    ])
  })

  it('fails when a fixture bundle exceeds its eng §15 budget', () => {
    const fixture = tree({
      'packages/core/src/index.js': moduleOf(1_000),
      'packages/graph/src/index.js': moduleOf(61_000),
      'packages/ui/src/index.js': moduleOf(1_000),
    })
    const result = checkSizes({ root: fixture.root, exceptions: {} })
    assert.equal(result.ok, false)
    assert.equal(result.problems.length, 1)
    assert.match(
      result.problems[0],
      /strata-graph \(minified\) is 61\.\d KB, over its 60 KB budget/
    )
  })

  it('passes bundles within their budgets and counts only minified code', () => {
    const fixture = tree({
      'packages/core/src/index.js': `${'// a long comment the minifier drops\n'.repeat(20_000)}export const one = 1\n`,
      'packages/graph/src/index.js': moduleOf(59_000),
      'packages/cli/src/index.js': moduleOf(300_000),
    })
    const result = checkSizes({ root: fixture.root, exceptions: {} })
    assert.deepEqual(result.problems, [])
    assert.equal(result.ok, true)
    const core = result.rows.find(r => r.label.startsWith('Core'))
    assert.ok(core && core.bytes !== null && core.bytes < 100, 'comments do not count')
  })

  it('reports a budget with nothing built for it yet as not built rather than measuring zero', () => {
    const fixture = tree({ 'packages/core/src/index.js': moduleOf(10) })
    const worker = checkSizes({ root: fixture.root, exceptions: {} }).rows.find(r =>
      r.label.startsWith('Simulation worker')
    )
    assert.equal(worker?.bytes, null)
  })

  it('measures the simulation worker as its bundle, including the modules it imports', () => {
    const fixture = tree({
      'packages/sim/src/worker/main.js':
        "import { data } from '../kernel.js'\nglobalThis.x = data\n",
      'packages/sim/src/kernel.js': moduleOf(30_000),
      'packages/sim/src/unused.js': moduleOf(50_000),
    })
    const worker = checkSizes({ root: fixture.root, exceptions: {} }).rows.find(r =>
      r.label.startsWith('Simulation worker')
    )
    assert.ok(worker?.bytes, 'the worker bundle is measured')
    assert.ok(worker.bytes > 30_000 && worker.bytes < 40_000, `${worker.bytes} bytes`)
  })

  it('lets a recorded exception stay over budget but grow no further', () => {
    const fixture = tree({ 'packages/graph/src/index.js': moduleOf(70_000) })
    const graph = 'strata-graph (minified)'
    const at = (/** @type {number} */ bytes) =>
      checkSizes({ root: fixture.root, exceptions: { [graph]: { bytes, owner: '0207' } } })
    assert.equal(at(80_000).ok, true)
    const grown = at(69_000)
    assert.equal(grown.ok, false)
    assert.match(
      grown.problems[0],
      /strata-graph \(minified\) is 70\.\d KB, over the 69 KB recorded/
    )
  })

  it('fails when a recorded exception is no longer needed', () => {
    const fixture = tree({ 'packages/graph/src/index.js': moduleOf(10) })
    const result = checkSizes({
      root: fixture.root,
      exceptions: { 'strata-graph (minified)': { bytes: 98_000, owner: '0207' } },
    })
    assert.equal(result.ok, false)
    assert.match(result.problems[0], /within its budget: remove its exception/)
  })

  it('keeps tools/ci/size-exceptions.json to budgets owned by later tasks', () => {
    const exceptions = JSON.parse(readFileSync(join(ROOT, 'tools/ci/size-exceptions.json'), 'utf8'))
    const labels = budgets().map(b => b.label)
    for (const [label, entry] of Object.entries(exceptions)) {
      assert.ok(labels.includes(label), `${label} is not an eng §15 budget`)
      assert.match(entry.owner, /^\d{4}$/, `${label} names the task that removes it`)
    }
  })
})

describe('licence check', () => {
  const lock = (/** @type {Record<string, object>} */ packages) =>
    JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'x' }, ...packages } })
  const d3 = {
    'vendor/d3/d3.min.js': '',
    'vendor/d3/LICENSE':
      'Copyright 2010-2023 Mike Bostock\n\nPermission to use, copy, modify, and/or distribute this software for any purpose\n',
  }

  it('passes permissive development dependencies and vendored code with its own licence', () => {
    const fixture = tree({
      ...d3,
      'package-lock.json': lock({
        'node_modules/a': { version: '1.0.0', license: 'MIT', dev: true },
        'node_modules/b': { version: '1.0.0', license: '(MIT OR GPL-3.0)', dev: true },
        'packages/core': { name: 'strata-core' },
        'node_modules/strata-core': { resolved: 'packages/core', link: true },
      }),
    })
    assert.deepEqual(checkLicences({ root: fixture.root }).problems, [])
  })

  it('fails a dependency whose licence is not on the allow-list', () => {
    const fixture = tree({
      ...d3,
      'package-lock.json': lock({
        'node_modules/copyleft': { version: '2.0.0', license: 'GPL-3.0-only', dev: true },
        'node_modules/unknown': { version: '1.0.0', dev: true },
      }),
    })
    const result = checkLicences({ root: fixture.root })
    assert.equal(result.ok, false)
    assert.deepEqual(result.problems, [
      'copyleft@2.0.0 is GPL-3.0-only, which is not on the allow-list',
      'unknown@1.0.0 declares no licence',
    ])
  })

  it('fails vendored code without its licence or with a different one', () => {
    const fixture = tree({
      'package-lock.json': lock({}),
      'vendor/d3/d3.min.js': '',
      'vendor/three/three.module.js': '',
      'vendor/three/LICENSE': 'Permission is hereby granted, free of charge, to any person',
      'vendor/leftpad/LICENSE': 'Permission is hereby granted, free of charge, to any person',
    })
    assert.deepEqual(checkLicences({ root: fixture.root }).problems, [
      'vendor/d3 has no LICENSE file',
      'vendor/leftpad is not an approved vendored library (eng §16)',
    ])
  })

  it('passes the repository', () => {
    assert.deepEqual(checkLicences().problems, [])
  })
})
