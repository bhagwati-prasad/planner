// strata new component, validate and test-component (task 0307, spec §8, eng §10, design
// system §13): a scaffolded component follows the behaviour API and passes its own self-test,
// and validate applies the icon rules, the behaviour contract and the determinism checks.
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { main } from '../src/cli.js'

/** @type {string} */
let cwd

/** Runs the CLI in `cwd`. @param {...string} argv */
async function run(...argv) {
  let stdout = ''
  let stderr = ''
  const code = await main(argv, {
    cwd,
    stdout: { write: (/** @type {string} */ t) => void (stdout += t) },
    stderr: { write: (/** @type {string} */ t) => void (stderr += t) },
  })
  return { code, stdout, stderr }
}

/** @param {string} path @param {string} content */
function write(path, content) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true })
  writeFileSync(join(cwd, path), content)
}

/** A scaffolded component, in components/router. */
async function scaffold() {
  const made = await run('new', 'component', 'router', '--id', 'acme.router')
  assert.equal(made.code, 0, made.stderr)
  return 'components/router'
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'strata-scaffold-'))
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

describe('strata new component, validate and test-component', () => {
  it('scaffolds a component that validates, follows the behaviour API and passes its self-test', async () => {
    const folder = await scaffold()
    const valid = await run('validate', folder)
    assert.equal(valid.code, 0, valid.stderr)
    assert.match(valid.stdout, /✓ acme\.router@0\.1\.0 is valid$/m)
    const tested = await run('test-component', folder)
    assert.equal(tested.code, 0, tested.stderr + tested.stdout)
    assert.match(tested.stdout, /✓ The behaviour matches the manifest/)
    assert.match(tested.stdout, /pass 1/)
    const manifest = JSON.parse(readFileSync(join(cwd, folder, 'manifest.json'), 'utf8'))
    assert.deepEqual(Object.keys(manifest.methods.public), ['handle'])
    assert.match(
      readFileSync(join(cwd, folder, 'tests/router.test.js'), 'utf8'),
      /createTestContext/
    )
  })

  it('fails an icon with a raster image, a script, or more than 4 KB', async () => {
    const folder = await scaffold()
    const icon = (/** @type {string} */ body) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`
    for (const [what, body, expected] of [
      [
        'raster',
        '<image href="data:image/png;base64,iVBORw0KGgo=" width="24" height="24"/>',
        /raster image/,
      ],
      ['script', '<path d="M4 4h16"/><script>alert(1)</script>', /script/],
      ['size', `<path d="${'M1 1h22'.repeat(700)}"/>`, /over 4 KB/],
    ]) {
      write(`${folder}/icon.svg`, icon(/** @type {string} */ (body)))
      const result = await run('validate', folder)
      assert.equal(result.code, 1, `${what}: ${result.stdout}`)
      assert.match(result.stderr, /icon\.svg.*design system §13/, what)
      assert.match(result.stderr, /** @type {RegExp} */ (expected), what)
    }
  })

  it('flags a behaviour that awaits a promise not from ctx', async () => {
    const folder = await scaffold()
    write(
      `${folder}/index.js`,
      `export default {
  public: {
    async handle (msg, ctx) {
      await ctx.call('check', msg.body)
      await new Promise(resolve => setTimeout(resolve, 5))
      const saved = await ctx.send('out', 'save', msg.body)
      await fetch('https://example.com')
      return saved
    }
  },
  private: {
    check () {}
  }
}
`
    )
    const result = await run('validate', folder)
    assert.equal(result.code, 1, result.stdout)
    const flagged = result.stderr.split('\n').filter(line => /awaits/.test(line))
    assert.deepEqual(
      flagged.map(line => /index\.js:(\d+)/.exec(line)?.[1]),
      ['5', '7']
    )
    assert.match(flagged[0], /only promises from ctx/)
  })

  it('checks the behaviour against the manifest, and flags module-level state', async () => {
    const folder = await scaffold()
    write(
      `${folder}/index.js`,
      `let seen = 0
export default {
  public: {
    handle (msg, ctx) { seen++; return { ok: true } },
    purge () { return { ok: true } }
  }
}
`
    )
    const result = await run('validate', folder)
    assert.equal(result.code, 1, result.stdout)
    assert.match(result.stderr, /public\.purge is not a public method in the manifest/)
    assert.match(result.stderr, /index\.js:1.*'seen' is module-level state/)
  })
})
