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
  UNKNOWN_COMMAND: 'No command is registered under that type',
  UNSUPPORTED: 'The feature arrives in a later release',

  E_ERROR_CODE_UNREGISTERED: 'An error was raised with a code missing from this registry',
  E_ADAPTER_MISSING: 'A required adapter (clock, random source) was not passed in at startup',

  E_COMMAND_PAYLOAD:
    'A command payload holds a value JSON cannot carry: undefined, a Date, a Map, a class instance, a function or a non-finite number',
  E_COMMAND_VERSION:
    'An operation was written by a newer version of its command, or a command version has no upgrader from the one before',

  E_BEHAVIOUR_SHAPE:
    'A behaviour module does not export an object of hooks, has an unknown hook, or a method that is not a function',
  E_BEHAVIOUR_UNDECLARED_METHOD: 'A behaviour has a public method the manifest does not declare',
  E_BEHAVIOUR_MISSING_METHOD:
    'A method the manifest declares, or ctx.call names, has no implementation',
  E_BEHAVIOUR_MODULE_STATE: 'A behaviour module keeps mutable state at module level',
  E_BEHAVIOUR_AWAIT: 'Behaviour code awaits a promise that did not come from ctx',
  E_ICON_RULE: 'A component icon breaks the rules of design system §13',
  E_BEHAVIOUR_UNDECLARED_STATE: 'Behaviour code set a state field the manifest does not declare',

  E_BUNDLE_BARE_SPECIFIER:
    'A bundle imports an npm package; only relative imports, d3 and three are allowed',
  E_BUNDLE_CYCLE:
    'Bundle modules import each other in a cycle through bindings that are not hoisted',
  E_BUNDLE_INTEGRITY:
    'A packed bundle was changed after packing, so its integrity hash does not match',
  E_BUNDLE_MISSING_EXPORT: 'A bundle module imports a name its target does not export',
  E_BUNDLE_MISSING_MODULE: 'A bundle module imports a file that is not in the bundle',
  E_BUNDLE_OUTSIDE_ROOT: 'A bundle module imports a path outside the component folder',
  E_BUNDLE_SYNTAX: 'A bundle module is not valid JavaScript',

  E_MANIFEST_IDENTITY:
    'A manifest id, name or version is missing or malformed, or the id is reserved',
  E_MANIFEST_KIND: 'A manifest is not an object, or its kind or extends is not valid',
  E_MANIFEST_API_RANGE: "A manifest's strataApi is missing, malformed or excludes this plugin API",
  E_MANIFEST_PORT: 'A manifest port has no name, a repeated name, or a bad direction or accepts',
  E_MANIFEST_UNKNOWN_METHOD: 'A manifest port exposes a method that is not declared public',
  E_MANIFEST_METHOD: 'A manifest method is malformed, or has a bad latency or errors list',
  E_MANIFEST_PROPERTY: 'A manifest property schema is not valid',
  E_MANIFEST_STATE: 'A manifest state field has a bad type, or a missing or bad initial value',
  E_MANIFEST_METRIC: 'A manifest metric is malformed or has an unknown roll-up rule',
  E_MANIFEST_FILE: 'A file a manifest names is missing or of the wrong kind',

  E_PORT_NOT_FOUND: 'A port an edge names does not exist',
  E_SYSTEM_CYCLE: 'The change would make a system contain itself, directly or through descendants',
  E_SYSTEM_READONLY:
    'The change is inside a system placed by reference, which is edited at its source or detached first',
  E_SYSTEM_TOO_DEEP: 'A system is nested deeper than the resolver limit of 64 levels',
  E_SYSTEM_EXISTS: 'The component already has an inner system',
  E_SYSTEM_NONE: 'The component has no inner system',
  E_SYSTEM_REQUIRED: 'A System component cannot lose its inner system; it is what the component is',
  E_SYSTEM_PATH: 'A path to a system names a node that is not a composite in the system before it',
  E_METHOD_NOT_EXPOSED: 'The port does not expose that public method',
  E_METHOD_UNBOUND:
    'A public method of a composite is not bound to a public method of a component inside',
  E_METHOD_UNREACHABLE:
    'A binding targets a component that the matching boundary port does not reach',
  E_METHOD_UNKNOWN: 'The component has no public method of that name',
  E_METHOD_FAILED: 'A method threw an error instead of returning a response or ctx.fail',
  E_EDGE_DIRECTION: 'An edge starts at an input-only port or ends at an output-only one',
  E_EDGE_SELF_LOOP: 'An edge starts and ends on the same component; that is a private method call',
  E_EDGE_CROSS_LEVEL:
    'An edge joins components in different systems; traffic crosses levels through boundary ports',

  E_UNIT_PARSE: 'A quantity is not written in a form its unit understands',
  E_UNIT_VALUE:
    'A value is not canonical for its quantity, such as money in fractions of a micro-unit',
  E_UNIT_UNKNOWN: 'No quantity of that name converts units',

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
  E_SIM_NOT_LOADED: 'A call names a component the simulation worker has not loaded',
  E_SIM_SEALED: 'The simulation worker has loaded its components; a new worker loads others',
  E_SIM_METHOD_HUNG: 'A method ran for 2 s without returning, so its worker was stopped',
  E_SIM_STOPPED: 'The simulation worker was stopped before it answered',
  E_SIM_NO_HOST: 'Simulations need a simulation host, which createStrata was not given',

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
  'UNKNOWN_COMMAND',
  'UNSUPPORTED',
])

/** @param {string} code @returns {code is ErrorCode} */
export const isErrorCode = code => Object.hasOwn(ERROR_CODES, code)
