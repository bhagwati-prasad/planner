/**
 * Defines every shell element and offers a one-call mount.
 */
import './canvas.js'
import './library.js'
import './tree.js'
import './inspector.js'
import './dock.js'
import './palette.js'
import './menu.js'
import { DEFAULT_CONFIG } from './app.js'

export { StrataApp, DEFAULT_CONFIG, TOKENS_CSS } from './app.js'
export { StrataElement, h, define } from './base.js'
export { Shell } from './shell.js'
export { registerDefaultActions, shortcutOf } from './actions.js'
export { fuzzyScore } from './palette.js'

/**
 * Mounts the workspace into an element.
 * @param {HTMLElement} host
 * @param {{ strata: any, config?: object }} options
 */
export function mountStrata (host, { strata, config = DEFAULT_CONFIG }) {
  const app = /** @type {any} */ (document.createElement('strata-app'))
  app.config = config
  app.strata = strata
  host.append(app)
  return app
}
