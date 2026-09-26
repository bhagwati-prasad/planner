// @ts-check
/**
 * Validation results (eng §14): validation returns `ok()` or `err(code, details)` instead of
 * throwing. Results are plain data, so they cross the worker boundary and serialise to JSON.
 */
import { StrataError } from './errors.js'
import { isErrorCode } from './errors/codes.js'
import { isDevelopment } from './mode.js'
import { toPlain } from './plain.js'

/**
 * @template [T=undefined]
 * @typedef {{ ok: true, value?: T }} Ok
 */
/**
 * @typedef {{ ok: false, code: import('./errors/codes.js').ErrorCode, details: Record<string, unknown> }} Err
 */

/**
 * A successful result, with an optional value.
 * @template T
 * @param {T} [value]
 * @returns {Ok<T>}
 */
export function ok(value) {
  return value === undefined ? { ok: true } : { ok: true, value }
}

/**
 * A failed result with a registered code and plain-data details.
 * @param {import('./errors/codes.js').ErrorCode} code
 * @param {Record<string, unknown>} [details]
 * @returns {Err}
 */
export function err(code, details = {}) {
  if (!isErrorCode(code) && isDevelopment())
    throw new StrataError(
      'E_ERROR_CODE_UNREGISTERED',
      `Error code '${code}' is not registered in core/src/errors/codes.js`,
      { code }
    )
  return { ok: false, code, details: toPlain(details, 'details') }
}
