// @ts-check
/**
 * The error code registry (eng §14). Every StrataError carries one of these codes, and each
 * code maps to a one-line description for developers and a message key for the UI's
 * translations (eng §22), so no user-facing English lives in the core. Codes are stable and
 * never reused; new codes are named E_<AREA>_<REASON> (eng §5).
 */

/** Description of every code. Keep them one line: what happened, from the developer's side. */
const DESCRIPTIONS = {
  // Legacy codes from before the plan. Each area's task replaces them with specific E_ codes.
  AMBIGUOUS: 'A name matches more than one entity; refer to it by id',
  CONFLICT: 'An entity with that id or name already exists',
  CYCLE: 'The change would make a system contain itself',
  INVALID: 'An argument, payload or property value failed validation',
  NOT_FOUND: 'A referenced project, system, node, port, edge or type does not exist',
  NO_ROLLUP_RULE: 'No roll-up rule is defined for that key',
  READ_ONLY: 'The target is read-only, such as a system placed by reference',
  UNKNOWN_COMMAND: 'No command is registered under that type',
  UNSUPPORTED: 'The feature arrives in a later release',

  E_ERROR_CODE_UNREGISTERED: 'An error was raised with a code missing from this registry',
  E_ADAPTER_MISSING: 'A required adapter (clock, random source) was not passed in at startup',

  E_COMMAND_PAYLOAD:
    'A command payload holds a value JSON cannot carry: undefined, a Date, a Map, a class instance, a function or a non-finite number',
  E_COMMAND_VERSION:
    'An operation was written by a newer version of its command, or a command version has no upgrader from the one before',

  E_BUNDLE_BARE_SPECIFIER:
    'A bundle imports an npm package; only relative imports, d3 and three are allowed',
  E_BUNDLE_CYCLE:
    'Bundle modules import each other in a cycle through bindings that are not hoisted',
  E_BUNDLE_MISSING_EXPORT: 'A bundle module imports a name its target does not export',
  E_BUNDLE_MISSING_MODULE: 'A bundle module imports a file that is not in the bundle',
  E_BUNDLE_OUTSIDE_ROOT: 'A bundle module imports a path outside the component folder',
  E_BUNDLE_SYNTAX: 'A bundle module is not valid JavaScript',

  E_PORT_NOT_FOUND: 'A port an edge names does not exist',

  E_SCHEMA_TYPE: 'A value has the wrong type for its property or state schema',
  E_SCHEMA_RANGE: "A value is below its schema's min or above its max",
  E_SCHEMA_ENUM: "A value is not one of its enum's options",
  E_SCHEMA_UNIT: 'A duration, size or rate is neither a number nor a string with a known unit',
  E_SCHEMA_DISTRIBUTION:
    'A distribution has an unknown kind, or a parameter that is missing or invalid',
  E_SCHEMA_FIELD: 'A table row lacks a column the table declares, or has one it does not',
  E_SCHEMA_KEY: "A table row repeats another row's key",
  E_SCHEMA_UNKNOWN_TYPE:
    'A schema names a type that is neither a property or state type nor a known record type',

  E_SIM_NO_EDGE: 'The system has no edge for a request to travel over',
  E_SIM_EDGE_NOT_FOUND: 'The edge a run names is not in the model',
  E_SIM_COMPONENT_NOT_FOUND: 'An edge in a run names a component that is not in the model',

  E_PROTOCOL_VERSION: 'A worker message uses a protocol version this build does not speak',
  E_PROTOCOL_UNKNOWN_TYPE: 'A worker message has a type the worker does not handle',
}

/** @typedef {keyof typeof DESCRIPTIONS} ErrorCode */
/** @typedef {{ description: string, userMessageKey: string }} ErrorCodeEntry */

/** @type {Readonly<Record<ErrorCode, Readonly<ErrorCodeEntry>>>} */
export const ERROR_CODES = Object.freeze(
  /** @type {Record<ErrorCode, Readonly<ErrorCodeEntry>>} */ (
    Object.fromEntries(
      Object.entries(DESCRIPTIONS).map(([code, description]) => [
        code,
        Object.freeze({ description, userMessageKey: `errors.${code}` }),
      ])
    )
  )
)

/** Codes from before E_<AREA>_<REASON>; the list only shrinks as tasks replace them. */
export const LEGACY_ERROR_CODES = Object.freeze([
  'AMBIGUOUS',
  'CONFLICT',
  'CYCLE',
  'INVALID',
  'NOT_FOUND',
  'NO_ROLLUP_RULE',
  'READ_ONLY',
  'UNKNOWN_COMMAND',
  'UNSUPPORTED',
])

/** @param {string} code @returns {code is ErrorCode} */
export const isErrorCode = code => Object.hasOwn(ERROR_CODES, code)
