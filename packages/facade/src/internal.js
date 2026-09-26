/**
 * Symbols shared between facade modules. They are not exported from the package, so clients
 * cannot reach past the facade into the core (spec §16).
 */
export const CORE = Symbol('strata.core')
export const STRATA = Symbol('strata.facade')
export const INSPECT = Symbol.for('nodejs.util.inspect.custom')

/**
 * The given fields of an options object. Command payloads never hold `undefined` (eng §7), so
 * an option left out is left out of the payload.
 * @template {Record<string, unknown>} T
 * @param {T} fields
 * @returns {Partial<T>}
 */
export const defined = fields =>
  /** @type {Partial<T>} */ (
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
  )
