/**
 * Error codes raised by the core. Every error thrown by a command handler or query is a
 * StrataError, so callers (UI, console, CLI) can branch on `code` instead of parsing messages.
 * Codes named E_<AREA>_<REASON> follow eng §5; the older ones move to that form with the error
 * code registry (task 0102).
 * @typedef {'INVALID'|'NOT_FOUND'|'CONFLICT'|'CYCLE'|'UNKNOWN_COMMAND'|'READ_ONLY'|'NO_ROLLUP_RULE'|'AMBIGUOUS'|'UNSUPPORTED'
 *   |'E_BUNDLE_BARE_SPECIFIER'|'E_BUNDLE_CYCLE'|'E_BUNDLE_MISSING_MODULE'|'E_BUNDLE_MISSING_EXPORT'|'E_BUNDLE_SYNTAX'|'E_BUNDLE_OUTSIDE_ROOT'
 *   |'E_PORT_NOT_FOUND'} ErrorCode
 */

export class StrataError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(code, message, details) {
    super(message)
    this.name = 'StrataError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

/**
 * Throws a StrataError.
 * @param {ErrorCode} code
 * @param {string} message
 * @param {unknown} [details]
 * @returns {never}
 */
export function fail(code, message, details) {
  throw new StrataError(code, message, details)
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
