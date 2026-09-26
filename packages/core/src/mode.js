// @ts-check
/**
 * Development mode: the checks that catch programmer mistakes early but cost time, such as
 * refusing unregistered error codes (eng §14) and deep-freezing committed state (eng §7). It is
 * on unless a production build turns it off.
 */
let development = true

/** Whether development checks run. */
export function isDevelopment() {
  return development
}

/**
 * Turns development checks on or off, for production builds and for tests of both modes.
 * @param {boolean} on
 */
export function setDevelopment(on) {
  development = Boolean(on)
}
