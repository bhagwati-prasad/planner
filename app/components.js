// Loading components into the app (spec §7 "Loading paths"). Served by `strata serve`, the
// app installs every component the server packed and reinstalls them when their folders
// change. Offline, packed scripts call Strata.registerComponent before the app starts.

/**
 * Installs the components the local server offers. Resolves to the number installed, or null
 * when the page is not served by strata serve.
 * @param {import('../packages/facade/src/index.js').Strata} strata
 * @param {{ replace?: boolean }} [options]
 */
export async function installServedComponents (strata, { replace = false } = {}) {
  if (!/^https?:$/.test(location.protocol)) return null
  let listing
  try {
    const res = await fetch('/api/components', { cache: 'no-store' })
    if (!res.ok) return null
    listing = await res.json()
  } catch {
    return null
  }
  let installed = 0
  for (const c of listing.components) {
    if (!c.bundle) {
      console.warn(`Strata: ${c.folder} was not packed:\n${c.problems.map(p => `  ${p.file}${p.line ? `:${p.line}` : ''}: ${p.message}`).join('\n')}`)
      continue
    }
    try {
      strata.components.install(c.bundle, { replace })
      installed++
    } catch (err) {
      console.warn(`Strata: ${c.typeRef} was not installed: ${err.message}`)
    }
  }
  return installed
}

/**
 * Reinstalls components whenever the server repacks a folder.
 * @param {import('../packages/facade/src/index.js').Strata} strata
 * @param {(message: string) => void} notify
 */
export function watchServedComponents (strata, notify) {
  if (!/^https?:$/.test(location.protocol) || typeof EventSource !== 'function') return () => {}
  const events = new EventSource('/api/events')
  events.addEventListener('components', async e => {
    const { changes } = JSON.parse(e.data)
    await installServedComponents(strata, { replace: true })
    for (const c of changes) {
      notify(c.action === 'failed' ? `${c.folder} has errors; see the console` : `${c.typeRef ?? c.folder} ${c.action}`)
    }
  })
  return () => events.close()
}
