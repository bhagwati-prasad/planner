/**
 * Errors raised by the core and the packages above it (eng §14). Every thrown error is a
 * StrataError, so callers (UI, console, CLI) branch on `code` instead of parsing messages. The
 * codes, with their descriptions and message keys, live in errors/codes.js.
 */
import { ERROR_CODES, isErrorCode } from './errors/codes.js'
import { isDevelopment } from './mode.js'

/** @typedef {import('./errors/codes.js').ErrorCode} ErrorCode */

export class StrataError extends Error {
  /**
   * @param {ErrorCode} code        a registered code; development builds refuse any other
   * @param {string} message        for developers; the UI shows the text for `userMessageKey`
   * @param {unknown} [details]     plain data about what failed
   * @param {{ cause?: unknown }} [options]  the error that caused this one
   */
  constructor(code, message, details, { cause } = {}) {
    const registered = isErrorCode(code)
    if (!registered && isDevelopment())
      throw new StrataError(
        'E_ERROR_CODE_UNREGISTERED',
        `Error code '${code}' is not registered in core/src/errors/codes.js (raised with: ${message})`,
        { code }
      )
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'StrataError'
    this.code = code
    /** The i18n key for the user-facing text (eng §22). */
    this.userMessageKey = registered ? ERROR_CODES[code].userMessageKey : `errors.${code}`
    if (details !== undefined) this.details = details
  }
}

/**
 * Throws a StrataError.
 * @param {ErrorCode} code
 * @param {string} message
 * @param {unknown} [details]
 * @param {{ cause?: unknown }} [options]
 * @returns {never}
 */
export function fail(code, message, details, options) {
  throw new StrataError(code, message, details, options)
}

/**
 * Returns the candidates closest to `input` (edit distance), for "did you mean" hints.
 * @param {string} input
 * @param {Iterable<string>} candidates
 * @param {number} [max]
 */
export function suggest(input, candidates, max = 3) {
  const lower = String(input).toLowerCase()
  return [...candidates]
    .map(c => ({ c, d: distance(lower, c.toLowerCase()) }))
    .filter(({ c, d }) => d <= Math.max(2, Math.floor(c.length / 3)))
    .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c))
    .slice(0, max)
    .map(({ c }) => c)
}

/** @param {string[]} list */
export function didYouMean(list) {
  return list.length ? ` Did you mean ${list.map(s => `'${s}'`).join(' or ')}?` : ''
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}
