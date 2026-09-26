// @ts-check
// The browser's real adapters (eng §6): the platform's clock, cryptographic randomness, timers
// and console, passed to createStrata once when the app starts. Each passes its contract suite
// in tools/contracts/.

/**
 * @param {{ console?: Pick<Console, 'debug'|'info'|'warn'|'error'|'log'> }} [options]
 *   the console to log to (tests pass a recording one)
 */
export function browserAdapters({ console: target = console } = {}) {
  /** @type {(level: 'debug'|'info'|'warn'|'error') => (message: string, data?: object) => void} */
  const log = level => (message, data) => {
    if (data === undefined) target[level](message)
    else target[level](message, data)
  }
  return {
    clock: () => Date.now(),
    /** @param {number} n */
    random: n => crypto.getRandomValues(new Uint8Array(n)),
    scheduler: {
      /** @param {() => void} fn @param {number} ms */
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      /** @param {any} handle */
      clearTimeout: handle => clearTimeout(handle),
    },
    logger: { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') },
    /** @param {string} text */
    output: text => target.log(text),
  }
}
