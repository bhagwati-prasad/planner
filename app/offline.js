// Entry of the offline build (spec §4 "Build", §7 "Packed bundle"). `npm run build` bundles
// it into dist/strata.js, a classic script that defines the global `Strata`:
//
//   Strata.registerComponent(bundle)   called by each packed .strata.js script tag
//   Strata.createStrata(options)       the facade, for embedding or scripting
//   Strata.mountStrata(host, options)  the workspace, for embedding
//
// A page whose <body> has the data-strata-app attribute (dist/strata.html) starts the app when
// the document has loaded, after every component script tag has run.
import { createStrata } from '../packages/facade/src/index.js'
import { mountStrata } from '../packages/ui/src/elements/index.js'
import { boot } from './boot.js'

export { createStrata, mountStrata }
export const version = '0.1.0'

/** @type {object[]} */
const pending = []
/** @type {any} */
let running = null

/**
 * Registers a packed component. Before the app starts, bundles wait in a queue; afterwards
 * they are installed straight away.
 * @param {object} bundle
 */
export function registerComponent(bundle) {
  if (running) return running.components.install(bundle, { replace: true })
  pending.push(bundle)
}

if (typeof document !== 'undefined') {
  const start = () => {
    if (!document.body?.hasAttribute('data-strata-app')) return
    boot({ bundles: pending.splice(0) })
      .then(({ strata }) => {
        running = strata
      })
      .catch(err => {
        console.error(err)
        document.body.textContent = `Strata could not start: ${err.message}`
      })
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
