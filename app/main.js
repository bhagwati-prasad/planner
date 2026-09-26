// Development entry for the Strata app: serve the repository (`npm run serve`) and open /app/.
// `npm run build` bundles the same app into the offline dist/strata.html.
import { boot } from './boot.js'

boot().catch(err => {
  console.error(err)
  document.body.textContent = `Strata could not start: ${err.message}`
})
