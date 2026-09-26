#!/usr/bin/env node
// Serves the repository for development and browser tests, through the same local server as
// `strata serve` (packages/strata-server), with the starter library as its components.
//
//   node scripts/dev-server.js [--port 4321]
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer as start } from '../packages/strata-server/src/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))
export const STARTER_DIRS = Object.freeze([resolve(root, 'starter/components'), resolve(root, 'starter/connection-types')])

/**
 * @param {import('../packages/strata-server/src/server.js').ServerOptions} [options]
 */
export function startServer (options = {}) {
  return start({ root, components: [...STARTER_DIRS], ...options })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = name => {
    const i = process.argv.indexOf(name)
    return i > 0 ? process.argv[i + 1] : undefined
  }
  const { url } = await startServer({ port: Number(arg('--port') ?? 4321), watch: true })
  console.log(`Serving the repository at ${url}/`)
  console.log(`  app:          ${url}/app/`)
  console.log(`  diagram demo: ${url}/examples/graph-demo.html`)
}
