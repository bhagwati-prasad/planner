#!/usr/bin/env node
// Serves the repository for development and browser tests, through the same local server as
// `strata serve` (packages/strata-server).
//
//   node scripts/dev-server.js [--port 4321]
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../packages/strata-server/src/index.js'

export { startServer }

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = name => {
    const i = process.argv.indexOf(name)
    return i > 0 ? process.argv[i + 1] : undefined
  }
  const { url } = await startServer({ port: Number(arg('--port') ?? 4321) })
  console.log(`Serving the repository at ${url}/`)
  console.log(`  app:          ${url}/app/`)
  console.log(`  diagram demo: ${url}/examples/graph-demo.html`)
}
