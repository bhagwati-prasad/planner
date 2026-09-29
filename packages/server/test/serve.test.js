// strata serve's security rules and live component folders (task 0306, spec §8 "Loading paths",
// eng §16 "Local server"). The strict CSP is task 0309's.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { startServer } from '../src/index.js'
import { messageQueueFolder } from '../../plugins/test/fixtures.js'

/** @type {string} */
let root
/** @type {import('../src/server.js').RunningServer} */
let server

/** Writes a component folder under root/components/<name>. @param {string} name @param {Record<string, string>} files */
function writeFolder(name, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, 'components', name, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

/**
 * A raw HTTP request, so a test can send any Host, Origin or Cookie header.
 * @param {string} path
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, body: string }>}
 */
function get(path, headers = {}) {
  const url = new URL(server.url)
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, headers }, res => {
      let body = ''
      res.on('data', d => {
        body += d
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** The session cookie the app page is served with, as a Cookie header, if it sends one. */
async function session() {
  const page = await get('/app/')
  const cookie = [page.headers['set-cookie'] ?? []]
    .flat()
    .find(c => c.startsWith('strata-session='))
  return cookie ? { cookie: cookie.split(';')[0] } : {}
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'strata-serve-'))
  mkdirSync(join(root, 'components'))
  mkdirSync(join(root, 'app'))
  writeFileSync(join(root, 'app', 'index.html'), '<!doctype html><title>app</title>')
  server = await startServer({ root, components: [join(root, 'components')], watch: true })
})

after(async () => {
  await server?.close()
  rmSync(root, { recursive: true, force: true })
})

describe('strata serve', () => {
  it(
    'lists a component folder added while running, without a restart',
    { timeout: 10_000 },
    async () => {
      const headers = await session()
      assert.deepEqual(JSON.parse((await get('/api/components', headers)).body).components, [])
      const changed = new Promise(resolve => server.catalog.onChange(resolve))
      writeFolder('message-queue', messageQueueFolder())
      await changed
      const listed = JSON.parse((await get('/api/components', headers)).body).components
      assert.deepEqual(
        listed.map((/** @type {any} */ c) => c.typeRef),
        ['acme.message-queue@1.2.0']
      )
    }
  )

  it('rejects requests with a foreign Host or Origin header', async () => {
    const headers = await session()
    const port = new URL(server.url).port
    assert.equal((await get('/app/', { host: 'evil.example' })).status, 403)
    assert.equal((await get('/app/', { host: `evil.example:${port}` })).status, 403)
    assert.equal(
      (await get('/api/components', { ...headers, origin: 'http://evil.example' })).status,
      403
    )
    assert.equal(
      (await get('/app/', { origin: `http://localhost:${Number(port) + 1}` })).status,
      403
    )
    assert.equal((await get('/api/components', { ...headers, origin: 'null' })).status, 403)
    // The page's own origin, and requests that send none, are served.
    assert.equal((await get('/api/components', { ...headers, origin: server.url })).status, 200)
    assert.equal((await get('/app/')).status, 200)
  })

  it('rejects API calls without the session token', async () => {
    const headers = await session()
    assert.ok(headers.cookie, 'the app page issues a session token')
    for (const path of [
      '/api/components',
      '/api/events',
      '/api/components/acme.message-queue@1.2.0.strata.js',
    ]) {
      const refused = await get(path)
      assert.equal(refused.status, 403, `${path} without the token`)
      assert.match(refused.body, /session token/)
      assert.equal(
        (await get(path, { cookie: 'strata-session=guess' })).status,
        403,
        `${path} with a wrong token`
      )
    }
    assert.equal((await get('/api/components', headers)).status, 200)
    const cookie = [(await get('/app/')).headers['set-cookie']].flat()[0] ?? ''
    assert.match(cookie, /; Path=\/; HttpOnly; SameSite=Strict/)
    // Readiness checks need no token and learn nothing about the components.
    assert.deepEqual(JSON.parse((await get('/api/health')).body), { ok: true })
  })
})
