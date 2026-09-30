/**
 * strata: the facade package. `createStrata(adapters)` returns the object exposed as `strata` in
 * the browser console and the Node REPL. The environment passes its adapters (eng §6): the app
 * passes the browser's (app/adapters.js), the CLI Node's (packages/cli/src/adapters.js), and
 * tests the fakes in tools/testing.
 */
export { Strata, createStrata } from './strata.js'
export { ProjectHandle, ProjectsApi } from './projects.js'
export { SystemHandle, NodeHandle, PortHandle, EdgeHandle, BoundaryPortHandle } from './handles.js'
export { Navigator } from './navigator.js'
export { Collection } from './collection.js'
export { createMemoryStorage } from './storage.js'
export { formatTable } from './format.js'
export { StrataError, createRegistry } from '../../core/src/index.js'
// The simulation worker's host (spec §8 "Sandbox"), which the app and Node give a `spawn`.
export { createSimHost } from './sim-host.js'
