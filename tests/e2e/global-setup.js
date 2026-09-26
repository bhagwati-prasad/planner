// @ts-check
// Builds dist/ once before the browser tests, so the smoke tests open the current code.
import { build } from '../../scripts/build.js'

export default async function globalSetup() {
  await build({ log: () => {} })
}
