/**
 * The local server (spec §7, §17, §19): `strata serve`. It serves the app and static files,
 * discovers and packs component folders, and pushes changes to open pages.
 *
 *   GET /api/components            every discovered component: metadata, problems and bundle
 *   GET /api/components/<ref>.strata.js   one packed script (ref = id@version)
 *   GET /api/events                server-sent events: 'components' when folders change
 *   GET /api/health
 *   anything else                  static files under `root`
 *
 * Security (§19 "Served mode"): it binds to a loopback address only, refuses requests whose
 * Host header is not local (DNS rebinding), serves only GET and HEAD, never lists directories
 * or leaves `root`, and sends a strict Content Security Policy.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ComponentCatalog } from './catalog.js'

export const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

/**
 * @typedef {object} ServerOptions
 * @property {string} [root]          directory served as static files (default: the repository)
 * @property {number} [port]          0 picks a free port
 * @property {string} [host]          a loopback address (default 127.0.0.1)
 * @property {string[]} [components]  directories containing component folders
 * @property {boolean} [watch]        repack and notify when component folders change
 * @property {string} [home]          where '/' redirects (default '/app/')
 *
 * @typedef {object} RunningServer
 * @property {string} url
 * @property {ComponentCatalog} catalog
 * @property {() => Promise<void>} close
 */

/**
 * @param {ServerOptions} [options]
 * @returns {Promise<RunningServer>}
 */
export async function startServer({
  root = fileURLToPath(new URL('../../..', import.meta.url)),
  port = 0,
  host = '127.0.0.1',
  components = [],
  watch = false,
  home = '/app/',
} = {}) {
  if (!LOOPBACK.has(host))
    throw new Error(
      `strata serve binds to this machine only; '${host}' is not a loopback address (use 127.0.0.1)`
    )
  const base = resolve(root)
  const catalog = new ComponentCatalog(components.map(dir => resolve(dir)))
  await catalog.scan()
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set()

  const security = {
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cache-control': 'no-store',
  }
  const send = (res, status, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    res.writeHead(status, { ...security, 'content-type': type, ...extra })
    res.end(body)
  }
  const json = (res, value) => send(res, 200, JSON.stringify(value), TYPES['.json'])

  const listing = () => ({
    components: catalog.entries().map(e => ({
      folder: ComponentCatalog.relativeFolder(e.folder, base),
      name: e.name,
      id: e.bundle?.manifest.id ?? null,
      version: e.bundle?.manifest.version ?? null,
      typeRef: e.bundle ? `${e.bundle.manifest.id}@${e.bundle.manifest.version}` : null,
      title: e.bundle?.manifest.name ?? e.name,
      fileName: e.fileName,
      script: e.bundle
        ? `/api/components/${encodeURIComponent(`${e.bundle.manifest.id}@${e.bundle.manifest.version}`)}.strata.js`
        : null,
      integrity: e.bundle?.integrity ?? null,
      problems: e.problems.map(p => ({
        ...p,
        file: `${ComponentCatalog.relativeFolder(e.folder, base)}/${p.file}`,
      })),
      bundle: e.bundle,
    })),
  })

  const server = createServer(async (req, res) => {
    try {
      const hostHeader = String(req.headers.host ?? '')
        .replace(/:\d+$/, '')
        .replace(/^\[(.*)\]$/, '$1')
      if (!LOOPBACK.has(hostHeader))
        return send(res, 403, 'Forbidden: strata serve only answers requests for localhost')
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return send(res, 405, 'Method not allowed', undefined, { allow: 'GET, HEAD' })
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = decodeURIComponent(url.pathname)

      if (pathname === '/' && home) return send(res, 302, '', undefined, { location: home })
      if (pathname === '/api/health')
        return json(res, { ok: true, components: catalog.entries().length })
      if (pathname === '/api/components') return json(res, listing())
      if (pathname.startsWith('/api/components/') && pathname.endsWith('.strata.js')) {
        const ref = pathname.slice('/api/components/'.length, -'.strata.js'.length)
        const entry = catalog
          .entries()
          .find(e => e.bundle && `${e.bundle.manifest.id}@${e.bundle.manifest.version}` === ref)
        return entry?.script
          ? send(res, 200, entry.script, TYPES['.js'])
          : send(res, 404, `No packed component ${ref}`)
      }
      if (pathname === '/api/events') {
        res.writeHead(200, {
          ...security,
          'content-type': 'text/event-stream',
          connection: 'keep-alive',
        })
        res.write(': connected\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (pathname.startsWith('/api/')) return send(res, 404, 'Unknown API endpoint')

      let path = normalize(join(base, pathname))
      if (path !== base && !path.startsWith(base + sep)) return send(res, 403, 'Forbidden')
      // Dotfiles and dot-folders (.git, .env, ...) are never served.
      if (
        path
          .slice(base.length)
          .split(sep)
          .some(part => part.startsWith('.'))
      )
        return send(res, 404, 'Not found')
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
      const body = await readFile(path)
      send(
        res,
        200,
        req.method === 'HEAD' ? '' : body,
        TYPES[extname(path)] ?? 'application/octet-stream'
      )
    } catch {
      if (!res.headersSent) send(res, 404, 'Not found')
    }
  })

  if (watch) {
    catalog.watch()
    catalog.onChange(changes => {
      const payload = `event: components\ndata: ${JSON.stringify({ changes: changes.map(c => ({ ...c, folder: ComponentCatalog.relativeFolder(c.folder, base) })) })}\n\n`
      for (const client of clients) client.write(payload)
    })
  }
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': ping\n\n')
  }, 25_000)
  heartbeat.unref?.()

  await new Promise(resolve => server.listen(port, host, () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  const shown = host.includes(':') ? `[${host}]` : host
  return {
    url: `http://${shown}:${address.port}`,
    catalog,
    close: () =>
      new Promise(resolve => {
        clearInterval(heartbeat)
        catalog.close()
        for (const client of clients) client.end()
        clients.clear()
        server.closeAllConnections?.()
        server.close(() => resolve())
      }),
  }
}
