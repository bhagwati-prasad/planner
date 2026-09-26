/**
 * Symbols shared between facade modules. They are not exported from the package, so clients
 * cannot reach past the facade into the core (spec §16).
 */
export const CORE = Symbol('strata.core')
export const STRATA = Symbol('strata.facade')
export const INSPECT = Symbol.for('nodejs.util.inspect.custom')
