// @ts-check
// A fake logger for tests (eng §14): it records every entry instead of printing, so a test can
// check what was logged and output stays clean.

/**
 * @typedef {object} LogEntry
 * @property {'debug'|'info'|'warn'|'error'} level
 * @property {string} message
 * @property {object} [data]
 *
 * @typedef {object} FakeLogger
 * @property {(message: string, data?: object) => void} debug
 * @property {(message: string, data?: object) => void} info
 * @property {(message: string, data?: object) => void} warn
 * @property {(message: string, data?: object) => void} error
 * @property {LogEntry[]} entries  everything logged, in order
 */

/** @returns {FakeLogger} */
export function createFakeLogger() {
  /** @type {LogEntry[]} */
  const entries = []
  const at =
    (/** @type {LogEntry['level']} */ level) =>
    (/** @type {string} */ message, /** @type {object} */ data) => {
      entries.push(data === undefined ? { level, message } : { level, message, data })
    }
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error'), entries }
}
