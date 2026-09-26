/**
 * `strata.components`: component types (spec §7). Built-in base types, bare manifests and
 * packed bundles all land in the same registry; bundles are also kept whole (modules, assets,
 * integrity) so the simulation worker (R1) and `.strata` exports (M5) can use them.
 */
import { deepFreeze, fail, typeRefOf, parseTypeRef } from '../../core/src/index.js'
import { readBundle, manifestOfBundle, packUpload } from '../../plugins/src/index.js'
import { Collection } from './collection.js'

/**
 * @typedef {import('../../plugins/src/index.js').ComponentBundle} ComponentBundle
 * @typedef {{ id: string, version: string, typeRef: string, name: string }} InstalledComponent
 */

export class ComponentsApi {
  #registry
  #emit
  /** @type {Map<string, ComponentBundle>} typeRef → bundle */
  #bundles = new Map()

  /**
   * @param {import('../../core/src/index.js').Registry} registry
   * @param {(event: string, data: any) => void} emit
   */
  constructor(registry, emit) {
    this.#registry = registry
    this.#emit = emit
  }

  /**
   * Registers a bare manifest (no behaviour code).
   * @param {unknown} manifest
   * @param {{ replace?: boolean }} [options]
   */
  register(manifest, options) {
    const m = this.#registry.register(manifest, options)
    this.#bundles.delete(typeRefOf(m))
    this.#emit('components', { action: 'register', typeRef: typeRefOf(m) })
    return m
  }

  /**
   * Installs a packed component: a bundle object, or the text of a `.strata.js` file. Its
   * integrity is checked first. Installing the same bundle again does nothing; a different
   * bundle with the same id and version needs `{ replace: true }` (the local server does this
   * when a component folder changes).
   * @param {ComponentBundle|string} input
   * @param {{ replace?: boolean }} [options]
   * @returns {InstalledComponent}
   */
  install(input, { replace = false } = {}) {
    const bundle = deepFreeze(structuredClone(readBundle(input)))
    const manifest = manifestOfBundle(bundle)
    const typeRef = `${manifest.id}@${manifest.version}`
    const info = { id: manifest.id, version: manifest.version, typeRef, name: manifest.name }
    if (this.#registry.get(typeRef)) {
      if (this.#bundles.get(typeRef)?.integrity === bundle.integrity) return info
      if (!replace) {
        fail(
          'CONFLICT',
          `${typeRef} is already installed with different contents. Give the new build a higher version, or pass { replace: true } to overwrite it.`
        )
      }
    }
    this.#registry.register(manifest, { replace: true })
    this.#bundles.set(typeRef, bundle)
    this.#emit('components', { action: 'install', typeRef })
    return info
  }

  /**
   * Packs uploaded files (a `.strata.js`, a zip of a component folder, or a folder's files)
   * with the same packer as `strata pack`. Nothing is installed.
   * @param {{ path: string, content: string|Uint8Array }[]} files
   * @param {{ inflateRaw?: (data: Uint8Array) => Uint8Array|Promise<Uint8Array> }} [options]
   */
  pack(files, options) {
    return packUpload(files, options)
  }

  /**
   * Packs uploaded files and installs the result.
   * @param {{ path: string, content: string|Uint8Array }[]} files
   * @param {{ replace?: boolean, inflateRaw?: (data: Uint8Array) => Uint8Array|Promise<Uint8Array> }} [options]
   * @returns {Promise<{ component: InstalledComponent|null, problems: import('../../plugins/src/index.js').Problem[] }>}
   */
  async upload(files, { replace, inflateRaw } = {}) {
    const result = await packUpload(files, { inflateRaw })
    if (!result.bundle) return { component: null, problems: result.problems }
    return { component: this.install(result.bundle, { replace }), problems: result.problems }
  }

  /**
   * Removes a component type (one version, or every version when none is given). Nodes that
   * use it keep their properties and show as placeholders until it is installed again.
   * @param {string} ref id or id@version
   */
  uninstall(ref) {
    const { id, version } = parseTypeRef(ref)
    if (id.startsWith('base:'))
      fail('INVALID', `'${id}' is a built-in base type and cannot be uninstalled`)
    const versions = version ? [version] : this.#registry.versions(id)
    if (!versions.length || (version && !this.#registry.get(ref)))
      fail('NOT_FOUND', `Component '${ref}' is not installed`)
    for (const v of versions) {
      this.#registry.unregister(id, v)
      this.#bundles.delete(`${id}@${v}`)
    }
    this.#emit('components', { action: 'uninstall', typeRef: version ? ref : id })
    return versions.length
  }

  /**
   * The packed bundle of an installed component, or null for built-in types and bare manifests.
   * @param {string} name id, id@version or short name
   * @returns {ComponentBundle|null}
   */
  bundle(name) {
    const m = this.#registry.find(name)
    return m ? (this.#bundles.get(typeRefOf(m)) ?? null) : null
  }

  /** A manifest with inheritance applied. @param {string} name id, id@version or short name */
  get(name) {
    return this.#registry.resolve(typeRefOf(this.#registry.require(name)))
  }

  /** Every version registered for an id. @param {string} id */
  versions(id) {
    return this.#registry.versions(id)
  }

  /**
   * Connection types (http, grpc, async-message, ...) with inheritance applied, latest versions.
   */
  connectionTypes() {
    return Collection.from(
      this.#registry
        .list({ kind: 'connection-type' })
        .filter(m => !m.abstract)
        .map(m => this.#registry.resolve(typeRefOf(m)))
    )
  }

  /**
   * The latest version of every registered type.
   * @param {{ kind?: 'component'|'connection-type' }} [options]  only types of this kind
   */
  list({ kind } = {}) {
    return Collection.from(
      this.#registry.list({ kind }).map(m => ({
        id: m.id,
        name: m.name,
        version: m.version,
        kind: m.kind ?? 'component',
        category: m.category ?? '',
        extends: m.extends ?? '',
        abstract: m.abstract,
        source: m.id.startsWith('base:')
          ? 'built-in'
          : this.#bundles.has(typeRefOf(m))
            ? 'bundle'
            : 'manifest',
      }))
    )
  }
}
