/**
 * strata-server: the local server behind `strata serve` (spec §4, §7). Node only.
 * R4 adds the sync server and R5 the SaaS services to this package.
 */
export { startServer, CSP } from './server.js'
export { ComponentCatalog } from './catalog.js'
export { readFolder, packFolder, syntaxProblems, componentFolders } from './folders.js'
// Node-side plugin tooling the CLI uses; eng §6 lets the CLI reach plugins only through here.
/**
 * @typedef {import('../../plugins/src/index.js').ComponentBundle} ComponentBundle
 * @typedef {import('../../plugins/src/index.js').Problem} Problem
 */
export {
  formatProblem,
  createModuleRuntime,
  tokenize,
  validateBehaviour,
  checkModuleState,
  createTestContext,
} from '../../plugins/src/index.js'
