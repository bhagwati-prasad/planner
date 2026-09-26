/**
 * strata: the facade package. `createStrata()` returns the object exposed as `strata` in the
 * browser console and the Node REPL.
 */
export { Strata, createStrata } from './strata.js'
export { ProjectHandle, ProjectsApi } from './projects.js'
export { SystemHandle, NodeHandle, PortHandle, EdgeHandle, BoundaryPortHandle } from './handles.js'
export { Navigator } from './navigator.js'
export { Collection } from './collection.js'
export { createMemoryStorage } from './storage.js'
export { formatTable } from './format.js'
export { StrataError, createRegistry } from '../../strata-core/src/index.js'
