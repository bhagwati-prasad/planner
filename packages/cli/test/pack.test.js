// strata pack (task 0304, spec §8 "Packed bundle" and "Loading paths"): a component folder
// becomes one .strata.js script that registers the manifest, the icon and every module; --install
// adds its script tag to an offline strata.html; and packing is deterministic.
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { main } from '../src/cli.js'
import { messageQueueFolder } from '../../plugins/test/fixtures.js'

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

/** Writes files under `cwd`, in the order given. @param {Record<string, string>} files */
function writeAll(files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }
}

/** The spec's message queue as a folder under `dir`, in the order given. */
const queueIn = (/** @type {string} */ dir, reverse = false) => {
  const entries = Object.entries(messageQueueFolder())
  writeAll(
    Object.fromEntries((reverse ? entries.reverse() : entries).map(([p, c]) => [`${dir}/${p}`, c]))
  )
}

const HTML =
  '<body>\n  <!-- STRATA:COMPONENTS:BEGIN - one line per packed component -->\n  <!-- STRATA:COMPONENTS:END -->\n</body>\n'

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'strata-pack-'))
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

describe('strata pack', () => {
  it('packs a multi-file component into one file that registers the manifest, the inline icon and every module', async () => {
    queueIn('queue')
    const packed = await run('pack', 'queue')
    assert.equal(packed.code, 0, packed.stderr)
    const script = readFileSync(join(cwd, 'queue/queue.strata.js'), 'utf8')

    /** @type {any[]} */
    const registered = []
    runInNewContext(script, {
      Strata: { registerComponent: (/** @type {any} */ b) => registered.push(b) },
    })
    assert.equal(registered.length, 1, 'the script registers one component')
    const [bundle] = registered
    assert.equal(bundle.manifest.id, 'acme.message-queue')
    assert.equal(bundle.icon, messageQueueFolder()['icon.svg'], 'the icon is inline')
    assert.deepEqual(Object.keys(bundle.modules).sort(), [
      'index.js',
      'lib/backoff.js',
      'lib/defaults.json',
    ])
    assert.equal(bundle.entry, 'index.js')
    assert.match(bundle.integrity, /^sha256-/)
    assert.match(bundle.modules['index.js'], /backoff/, 'modules travel as source text')
  })

  it('--install inserts exactly one script tag between the markers, and is idempotent', async () => {
    queueIn('queue')
    writeAll({ 'strata.html': HTML })
    assert.equal((await run('pack', 'queue', '--install', 'strata.html')).code, 0)
    const once = readFileSync(join(cwd, 'strata.html'), 'utf8')
    const again = await run('pack', 'queue', '--install', 'strata.html')
    assert.equal(again.code, 0, again.stderr)
    assert.match(again.stdout, /already in strata\.html/)
    const twice = readFileSync(join(cwd, 'strata.html'), 'utf8')
    assert.equal(twice, once, 'installing again changes nothing')
    const block = twice.slice(
      twice.indexOf('STRATA:COMPONENTS:BEGIN'),
      twice.indexOf('STRATA:COMPONENTS:END')
    )
    assert.deepEqual(block.match(/<script [^>]*><\/script>/g), [
      '<script src="queue/queue.strata.js"></script>',
    ])
    assert.equal(twice.match(/<script /g)?.length, 1, 'no tag outside the markers')
  })

  it('gives byte-identical output for the same folder, whatever order its files were written in', async () => {
    // The file's header names the folder, so both copies are folders named queue.
    queueIn('a/queue')
    queueIn('b/queue', true)
    assert.equal((await run('pack', 'a/queue', '--out', 'first.strata.js')).code, 0)
    assert.equal((await run('pack', 'a/queue', '--out', 'again.strata.js')).code, 0)
    assert.equal((await run('pack', 'b/queue', '--out', 'other.strata.js')).code, 0)
    const bytes = (/** @type {string} */ file) => readFileSync(join(cwd, file))
    assert.ok(bytes('first.strata.js').equals(bytes('again.strata.js')), 'packing twice')
    assert.ok(bytes('first.strata.js').equals(bytes('other.strata.js')), 'another file order')
  })
})
