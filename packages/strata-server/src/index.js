/**
 * strata-server: the local server behind `strata serve` (spec §4, §7). Node only.
 * R4 adds the sync server and R5 the SaaS services to this package.
 */
export { startServer, CSP } from './server.js'
export { ComponentCatalog } from './catalog.js'
export { readFolder, packFolder, syntaxProblems, componentFolders } from './folders.js'
