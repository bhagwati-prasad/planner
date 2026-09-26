// Starts the Strata app (spec §9) in a page: creates the facade, installs components (packed
// bundles registered by script tags, then anything the local server offers), opens a
// project and mounts the workspace. Shared by the development page and the offline build.
import { createStrata } from '../packages/facade/src/index.js'
import { mountStrata } from '../packages/ui/src/elements/index.js'
import { buildSampleProject } from './sample.js'
import { installServedComponents, watchServedComponents } from './components.js'
import { browserSimHost } from './sim-host.js'

/**
 * @param {{ bundles?: object[], host?: HTMLElement }} [options]
 *   bundles: packed components registered before the app started (offline script tags)
 */
export async function boot({ bundles = [], host = document.body } = {}) {
  const strata = createStrata({ simHost: browserSimHost() })
  const failed = []
  for (const bundle of bundles) {
    try {
      strata.components.install(/** @type {any} */ (bundle))
    } catch (err) {
      failed.push(`${/** @type {any} */ (bundle)?.manifest?.id ?? 'a component'}: ${err.message}`)
    }
  }
  const served = await installServedComponents(strata, { replace: true })
  if (served === null && !bundles.length)
    console.warn(
      'Strata: no components were loaded (open the app through strata serve, or add packed components to strata.html).'
    )
  if (strata.components.get('starter.service')) await buildSampleProject(strata)
  else await strata.projects.create('Untitled')

  // The console API (spec §16): everything the UI does is available as `strata` in DevTools.
  Object.assign(window, { strata })
  const app = mountStrata(host, { strata })
  Object.assign(window, { strataApp: app })
  for (const message of failed) app.shell.notify(`Not installed: ${message}`, 'error')
  if (served !== null) watchServedComponents(strata, message => app.shell.notify(message))
  console.info('Strata: the console API is available as `strata`. Try strata.help().')
  return { strata, app }
}
