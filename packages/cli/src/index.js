// @ts-check
/**
 * strata-cli: the `strata` command (spec §8, §18). `bin/strata.js` runs `main`; tests and
 * the build import from here, the package's only public entry point (eng §4).
 */
export { main, parseArgs, UsageError, VERSION } from './cli.js'
export { installScriptTag, BEGIN_MARKER, END_MARKER } from './install.js'
