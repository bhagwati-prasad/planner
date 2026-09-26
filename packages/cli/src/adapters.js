// @ts-check
// Node's real adapters (eng §6): the platform's clock, cryptographic randomness and timers, with
// the logger on stderr (eng §14) and print() and help() on stdout. The CLI passes them to
// createStrata once at startup; each passes its contract suite in tools/contracts/.
import { webcrypto } from 'node:crypto'

/**
 * @param {{ stdout?: { write: (text: string) => unknown }, stderr?: { write: (text: string) => unknown }, verbose?: boolean }} [options]
 *   the streams to write to; debug lines appear only with `verbose` (`--verbose`)
 */
export function nodeAdapters({
  stdout = process.stdout,
  stderr = process.stderr,
  verbose = true,
} = {}) {
  /** @type {(level: 'debug'|'info'|'warn'|'error') => (message: string, data?: object) => void} */
  const log = level => (message, data) => {
    if (level === 'debug' && !verbose) return
    stderr.write(`[${level}] ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}\n`)
  }
  return {
    clock: () => Date.now(),
    /** @param {number} n */
    random: n => webcrypto.getRandomValues(new Uint8Array(n)),
    scheduler: {
      /** @param {() => void} fn @param {number} ms */
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      /** @param {any} handle */
      clearTimeout: handle => clearTimeout(handle),
    },
    logger: { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') },
    /** @param {string} text */
    output: text => void stdout.write(`${text}\n`),
  }
}
