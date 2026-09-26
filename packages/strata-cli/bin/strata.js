#!/usr/bin/env node
// The strata command. See `strata help`.
const [major] = process.versions.node.split('.').map(Number)
if (major < 20) {
  console.error(`strata needs Node 20 or newer (this is Node ${process.versions.node}).`)
  process.exit(1)
}
const { main } = await import('../src/cli.js')
process.exitCode = await main(process.argv.slice(2))
