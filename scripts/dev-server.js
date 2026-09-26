#!/usr/bin/env node
// A zero-dependency static file server for development and browser tests. Browsers refuse
// ES modules from file:// pages, so source runs over http until the M4 bundler produces the
// offline build. `strata serve` (M4) replaces this for real use.
//
//   node scripts/dev-server.js [--port 4321] [--open-page examples/graph-demo.html]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2'
}

/**
 * @param {{ root?: string, port?: number, host?: string }} [options]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startServer ({ root = fileURLToPath(new URL('..', import.meta.url)), port = 0, host = '127.0.0.1' } = {}) {
  const base = resolve(root)
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      let path = normalize(join(base, decodeURIComponent(url.pathname)))
      if (path !== base && !path.startsWith(base + sep)) {
        res.writeHead(403).end('Forbidden')
        return
      }
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
      const body = await readFile(path)
      res.writeHead(200, {
        'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:"
      })
      res.end(body)
    } catch {
      res.writeHead(404).end('Not found')
    }
  })
  await new Promise(resolve => server.listen(port, host, resolve))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    url: `http://${host}:${address.port}`,
    close: () => new Promise(resolve => server.close(() => resolve()))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = name => {
    const i = process.argv.indexOf(name)
    return i > 0 ? process.argv[i + 1] : undefined
  }
  const { url } = await startServer({ port: Number(arg('--port') ?? 4321) })
  console.log(`Serving the repository at ${url}/`)
  console.log(`  diagram demo: ${url}/examples/graph-demo.html`)
}
