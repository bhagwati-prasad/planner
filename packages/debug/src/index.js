// @ts-check
/**
 * strata-debug: breakpoints, stepping in every unit, time travel, state and method inspection, and the trace recorder.
 * Runs in: Worker and facade. Specified in spec §13; built in M04 and M10.
 * This is the package's only public entry point (eng §4).
 */
export { createDebugger } from './debugger.js'
export { debugExtensions } from './session.js'
