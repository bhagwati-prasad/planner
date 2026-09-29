import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { startServer, CSP, packFolder, syntaxProblems } from '../src/index.js'
import { readBundle } from '../../plugins/src/index.js'
import { messageQueueFolder } from '../../plugins/test/fixtures.js'

let root
let server
/** The session cookie the app page comes with; API calls need it (eng §16). */
let session = ''
/** An API call with the session token. @param {string} path @param {RequestInit} [init] */
const api = (path, init = {}) =>
  fetch(`${server.url}${path}`, { ...init, headers: { cookie: session } })

/** Writes a component folder under root/components/<name>. */
function writeFolder(name, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, 'components', name, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

/** A raw HTTP request, so tests can send any Host header and method. */
function raw(path, { method = 'GET', host } = {}) {
  const url = new URL(server.url)
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, path, method, headers: host ? { host } : {} },
      res => {
        let body = ''
        res.on('data', d => {
          body += d
        })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'strata-serve-'))
  writeFolder('message-queue', messageQueueFolder())
  writeFolder('broken', { 'manifest.json': '{ "id": "acme.broken" }' })
  mkdirSync(join(root, 'app'))
  writeFileSync(join(root, 'app', 'index.html'), '<!doctype html><title>app</title>')
  writeFileSync(join(root, '.env'), 'SECRET=1')
  server = await startServer({ root, components: [join(root, 'components')], watch: true })
  session = (await fetch(`${server.url}/app/`)).headers.get('set-cookie')?.split(';')[0] ?? ''
})

after(async () => {
  await server?.close()
  rmSync(root, { recursive: true, force: true })
})

test('the component API lists packed components and their problems', async () => {
  const res = await api('/api/components')
  assert.equal(res.headers.get('content-security-policy'), CSP)
  const { components } = await res.json()
  assert.deepEqual(
    components.map(c => [c.folder, c.typeRef]),
    [
      ['components/broken', null],
      ['components/message-queue', 'acme.message-queue@1.2.0'],
    ]
  )
  const [broken, queue] = components
  assert.ok(
    broken.problems.some(
      p =>
        p.level === 'error' &&
        p.file === 'components/broken/manifest.json' &&
        /strataApi is required/.test(p.message)
    )
  )
  assert.equal(queue.script, '/api/components/acme.message-queue%401.2.0.strata.js')
  assert.deepEqual(readBundle(queue.bundle), queue.bundle, 'bundles arrive intact')

  const script = await api(queue.script)
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(readBundle(await script.text()).integrity, queue.integrity)
  assert.equal((await api('/api/components/acme.nope@1.0.0.strata.js')).status, 404)
  assert.equal((await api('/api/nope')).status, 404)
})

test('static files, redirects and the security rules of served mode', async () => {
  const home = await fetch(`${server.url}/`, { redirect: 'manual' })
  assert.equal(home.status, 302)
  assert.equal(home.headers.get('location'), '/app/')
  const app = await fetch(`${server.url}/app/`)
  assert.equal(app.status, 200)
  assert.match(await app.text(), /<title>app<\/title>/)
  for (const header of ['x-content-type-options', 'referrer-policy', 'cross-origin-opener-policy'])
    assert.ok(app.headers.get(header), header)

  assert.equal(
    (await raw('/app/', { host: 'evil.example:80' })).status,
    403,
    'DNS rebinding: foreign Host headers are refused'
  )
  assert.equal((await raw('/app/', { host: `localhost:${new URL(server.url).port}` })).status, 200)
  assert.equal((await raw('/app/', { method: 'POST' })).status, 405)
  assert.equal((await raw('/.env')).status, 404, 'dotfiles are never served')
  for (const path of [
    '/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/app/..%2f..%2f..%2fetc/passwd',
  ]) {
    assert.ok([403, 404].includes((await raw(path)).status), `${path} stays inside root`)
  }
  assert.equal((await fetch(`${server.url}/api/health`).then(r => r.json())).ok, true)
  await assert.rejects(startServer({ root, host: '0.0.0.0' }), /binds to this machine only/)
})

test('changing a component folder repacks it and notifies open pages', async () => {
  const controller = new AbortController()
  const res = await api('/api/events', { signal: controller.signal })
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const next = async () => {
    while (!text.includes('event: components')) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    return text
  }
  const before = (await (await api('/api/components')).json()).components[1].integrity
  writeFileSync(join(root, 'components', 'message-queue', 'README.md'), '# Changed\n')
  const event = await next()
  const data = JSON.parse(/data: (.*)\n/.exec(event)?.[1] ?? '{}')
  assert.deepEqual(data.changes, [
    { action: 'changed', folder: 'components/message-queue', typeRef: 'acme.message-queue@1.2.0' },
  ])
  const after = (await (await api('/api/components')).json()).components[1].integrity
  assert.notEqual(after, before)
  controller.abort()
})

test('packFolder adds a V8 syntax check with the author’s line numbers', async () => {
  const dir = join(root, 'syntax')
  const files = {
    ...messageQueueFolder(),
    'lib/backoff.js': 'export function backoff (attempt) {\n  return attempt +\n}\n',
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  const result = await packFolder(dir)
  assert.equal(result.bundle, null)
  const [problem] = result.problems.filter(p => p.level === 'error')
  assert.equal(problem.file, 'lib/backoff.js')
  assert.equal(problem.line, 3)
  assert.match(problem.message, /SyntaxError/)
  assert.deepEqual(syntaxProblems({ 'ok.js': 'function () { return 1 }' }), [])
})
