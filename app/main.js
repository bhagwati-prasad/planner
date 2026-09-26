// Development entry for the Strata app (spec §9). The M4 bundler turns this into the offline
// strata.html; until then serve the repository (`npm run serve`) and open /app/.
import { createStrata } from '../packages/strata/src/index.js'
import { mountStrata } from '../packages/strata-ui/src/elements/index.js'
import { SAMPLE_COMPONENTS, buildSampleProject } from './sample.js'

const strata = createStrata()
for (const manifest of SAMPLE_COMPONENTS) strata.components.register(manifest)
await buildSampleProject(strata)

// The console API (spec §16): everything the UI does is available as `strata` in DevTools.
Object.assign(window, { strata })
const app = mountStrata(document.body, { strata })
Object.assign(window, { strataApp: app })
console.info('Strata: the console API is available as `strata`. Try strata.help().')
