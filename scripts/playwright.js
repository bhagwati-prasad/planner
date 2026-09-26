// Locates Playwright without making it a dependency: a local install, PLAYWRIGHT_MODULE, or
// the global npm root.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** @returns {Promise<any|null>} the playwright module, or null */
export async function findPlaywright () {
  try { return await import('playwright') } catch { /* not installed locally */ }
  const candidates = []
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE)
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    candidates.push(join(globalRoot, 'playwright'))
  } catch { /* npm unavailable */ }
  for (const dir of candidates) {
    const entry = dir.endsWith('.mjs') ? dir : join(dir, 'index.mjs')
    if (existsSync(entry)) {
      try { return await import(pathToFileURL(entry).href) } catch { /* try the next one */ }
    }
  }
  return null
}
