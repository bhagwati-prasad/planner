// Development entry for the Strata app (spec §9). Serve the repository (`npm run serve`) and
// open /app/; the M4 build turns the same code into the offline strata.html.
import { createStrata } from '../packages/strata/src/index.js'
import { mountStrata } from '../packages/strata-ui/src/elements/index.js'
import { buildSampleProject } from './sample.js'
import { installServedComponents, watchServedComponents } from './components.js'

async function start () {
  const strata = createStrata()
  const installed = await installServedComponents(strata)
  if (installed === null) console.warn('Strata: not served by strata serve, so no components were loaded.')
  if (strata.components.get('starter.service')) await buildSampleProject(strata)
  else await strata.projects.create('Untitled')

  // The console API (spec §16): everything the UI does is available as `strata` in DevTools.
  Object.assign(window, { strata })
  const app = mountStrata(document.body, { strata })
  Object.assign(window, { strataApp: app })
  watchServedComponents(strata, message => app.shell.notify(message))
  console.info('Strata: the console API is available as `strata`. Try strata.help().')
}

start().catch(err => {
  console.error(err)
  document.body.textContent = `Strata could not start: ${err.message}`
})
