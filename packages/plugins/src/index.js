/**
 * strata-plugins: manifest validation, the in-house bundler, the component packer and the
 * loaders that turn folders, zips and packed scripts into bundles (spec §4, §7). Headless:
 * the CLI, the local server and the upload dialog all use it.
 */
/**
 * @typedef {import('./pack.js').ComponentBundle} ComponentBundle
 * @typedef {import('./pack.js').PackResult} PackResult
 * @typedef {import('./bundle.js').Problem} Problem
 * @typedef {import('./zip.js').InflateRaw} InflateRaw
 */
export {
  sha256,
  toHex,
  toBase64,
  fromBase64,
  integrityOf,
  canonicalJson,
} from '../../core/src/index.js'
export { tokenize, SyntaxProblem } from './tokenize.js'
export { transformModule, transformJson, ModuleError, MODULE_PARAMS } from './modules.js'
export {
  bundleModules,
  emitScript,
  moduleTable,
  createModuleRuntime,
  normalizePath,
  resolveImport,
  formatProblem,
} from './bundle.js'
export { validateManifest, checkIcon, PLUGIN_KINDS, MANIFEST_KEYS } from './manifest.js'
export { validateBehaviour, checkModuleState, createTestContext } from './behaviour.js'
export {
  packComponent,
  componentScript,
  behaviourScript,
  readBundle,
  manifestOfBundle,
  requireBundle,
  bundleIntegrity,
  normalizeFiles,
  asText,
  jsonErrorOffset,
  BUNDLE_FORMAT,
} from './pack.js'
export { readZip, isZip } from './zip.js'
export { minify } from './minify.js'
export { packUpload } from './upload.js'
