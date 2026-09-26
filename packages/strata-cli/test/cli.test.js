import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { main, parseArgs } from '../src/cli.js'
import { checkBehaviour } from '../src/sandbox.js'
import { readBundle, packComponent } from '../../strata-plugins/src/index.js'
import { messageQueueFolder } from '../../strata-plugins/test/fixtures.js'

let cwd

/** Runs the CLI in `cwd`, capturing its output. */
async function run (...argv) {
  let stdout = ''
  let stderr = ''
  const code = await main(argv, { cwd, stdout: { write: t => { stdout += t } }, stderr: { write: t => { stderr += t } } })
  return { code, stdout, stderr }
}

const write = (path, content) => {
  mkdirSync(dirname(join(cwd, path)), { recursive: true })
  writeFileSync(join(cwd, path), content)
}

beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'strata-cli-')) })
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

test('new, validate, pack and install: the author’s loop', async () => {
  const created = await run('new', 'component', 'order-router', '--extends', 'base:proxy', '--id', 'acme.order-router')
  assert.equal(created.code, 0, created.stderr)
  assert.match(created.stdout, /Created components\/order-router\/ \(manifest\.json, package\.json, icon\.svg, index\.js, README\.md, tests\/order-router\.test\.js\)/)
  const manifest = JSON.parse(readFileSync(join(cwd, 'components/order-router/manifest.json'), 'utf8'))
  assert.equal(manifest.id, 'acme.order-router')
  assert.equal(manifest.extends, 'base:proxy')
  assert.equal(manifest.category, 'Edge')

  const valid = await run('validate', 'components/order-router')
  assert.equal(valid.code, 0, valid.stderr)
  assert.match(valid.stdout, /✓ acme\.order-router@0\.1\.0 is valid/)

  write('strata.html', '<body>\n  <!-- STRATA:COMPONENTS:BEGIN - one line per packed component -->\n  <!-- STRATA:COMPONENTS:END -->\n</body>\n')
  const packed = await run('pack', 'components/order-router', '--install', 'strata.html')
  assert.equal(packed.code, 0, packed.stderr)
  assert.match(packed.stdout, /✓ acme\.order-router@0\.1\.0 → components\/order-router\/order-router\.strata\.js \([\d.]+ KB, 1 modules\)\n {2}added to strata\.html/)
  const script = readFileSync(join(cwd, 'components/order-router/order-router.strata.js'), 'utf8')
  assert.equal(readBundle(script).manifest.id, 'acme.order-router')
  assert.ok(!('package.json' in readBundle(script).assets), 'package.json stays out of the bundle')
  const again = await run('pack', '--all', '--install', 'strata.html')
  assert.match(again.stdout, /already in strata\.html\n1 of 1 packed/)
  const html = readFileSync(join(cwd, 'strata.html'), 'utf8')
  assert.equal(html.match(/<script src="components\/order-router\/order-router\.strata\.js"><\/script>/g)?.length, 1)
  assert.match(html, /\n {2}<script src=.*\n {2}<!-- STRATA:COMPONENTS:END -->/, 'the tag takes the marker’s indentation')

  const out = await run('pack', 'components/order-router', '--out', 'dist/router.strata.js')
  assert.equal(out.code, 1, 'the output folder must exist')
  mkdirSync(join(cwd, 'dist'))
  assert.equal((await run('pack', 'components/order-router', '--out', 'dist/router.strata.js')).code, 0)
  assert.ok(existsSync(join(cwd, 'dist/router.strata.js')))
})

test('test-component runs the sandbox check and the self-tests', async () => {
  await run('new', 'component', 'worker')
  const ok = await run('test-component', 'components/worker')
  assert.equal(ok.code, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /✓ Behaviour loads in the sandbox; hooks: init, onMessage, onTimer/)
  assert.match(ok.stdout, /a message is forwarded after the service time/)

  write('components/worker/tests/worker.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('fails', () => assert.equal(1, 2))\n")
  assert.equal((await run('test-component', 'components/worker')).code, 1)
})

test('errors: problems go to stderr with file and line, and the exit code says so', async () => {
  for (const [path, content] of Object.entries(messageQueueFolder())) write(`components/queue/${path}`, content)
  write('components/queue/lib/backoff.js', 'export function backoff () {\n  return "open\n}\n')
  const bad = await run('pack', 'components/queue')
  assert.equal(bad.code, 1)
  assert.match(bad.stderr, /components\/queue\/lib\/backoff\.js:2: error: Unterminated string/)
  assert.match(bad.stderr, /✗ components\/queue: not packed/)
  assert.equal((await run('validate', 'components/queue')).code, 1)

  write('components/other/manifest.json', '{}')
  const all = await run('pack', '--all')
  assert.equal(all.code, 1)
  assert.match(all.stdout, /0 of 2 packed/)
})

test('usage errors and commands from later releases', async () => {
  assert.equal((await run()).code, 0)
  assert.match((await run('--version')).stdout, /^strata \d+\.\d+\.\d+\n$/)
  assert.match((await run('help', 'pack')).stdout, /--install adds the\nscript tag/)
  const unknown = await run('deploy')
  assert.equal(unknown.code, 2)
  assert.match(unknown.stderr, /Unknown command 'deploy'/)
  const later = await run('run', 'checkout')
  assert.equal(later.code, 2)
  assert.match(later.stderr, /strata run arrives in R1 \(simulation\)/)
  assert.match((await run('new', 'project', 'x')).stderr, /arrives with projects on disk \(M5\)/)
  assert.match((await run('new', 'component', 'Bad_Name')).stderr, /lowercase words joined by hyphens/)
  assert.match((await run('new', 'component', 'x', '--extends', 'base:nope')).stderr, /--extends must be one of/)
  assert.match((await run('pack', 'missing')).stderr, /missing does not exist/)
  assert.match((await run('pack', 'x', '--bogus')).stderr, /Unknown option --bogus/)
  assert.match((await run('serve', '--port')).stderr, /--port needs a value/)
  assert.deepEqual(parseArgs(['a', '--components', 'x', '--components=y', '--no-watch'], { components: 'list', watch: 'boolean' }), {
    positionals: ['a'], options: { components: ['x', 'y'], watch: false }
  })
})

test('serve starts the local server with the components it finds, until stopped', async () => {
  for (const [path, content] of Object.entries(messageQueueFolder())) write(`components/message-queue/${path}`, content)
  const controller = new AbortController()
  let stdout = ''
  const running = main(['serve', '--port', '0', '--root', '.'], { cwd, signal: controller.signal, stdout: { write: t => { stdout += t } }, stderr: { write: () => {} } })
  while (!/Press Ctrl\+C/.test(stdout)) await new Promise(resolve => setTimeout(resolve, 10))
  const url = /running at (http:\/\/[^/\s]+)\//.exec(stdout)?.[1]
  assert.ok(url)
  assert.match(stdout, /components: 1 packed from components/)
  const { components } = await (await fetch(`${url}/api/components`)).json()
  assert.equal(components[0].typeRef, 'acme.message-queue@1.2.0')
  controller.abort()
  assert.equal(await running, 0)
})

test('the sandbox has no network or Node APIs, seeded randomness and a time limit', async () => {
  const folder = (index) => ({ ...messageQueueFolder(), 'index.js': index })
  const check = async index => {
    const { bundle } = packComponent(folder(index))
    assert.ok(bundle)
    return checkBehaviour(bundle)
  }
  const net = await check("fetch('https://example.com')\nexport default {}")
  assert.equal(net.ok, false)
  assert.match(net.messages.join(), /fetch is not defined/)
  assert.match((await check('process.exit(1)\nexport default {}')).messages.join(), /process is not defined/)
  assert.match((await check('while (true) {}\nexport default {}')).messages.join(), /timed out/)
  assert.match((await check("export default { onMesage () {} }")).messages.join(), /Unknown hook 'onMesage'\. Did you mean 'onMessage'\?/)
  assert.match((await check("new Function('return 1')()\nexport default {}")).messages.join(), /Code generation from strings disallowed/)
  const seeded = await check('export default { init () {} }\nexport const r = Math.random()')
  assert.equal(seeded.ok, true)
})
