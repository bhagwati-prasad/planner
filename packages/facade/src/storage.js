/**
 * Storage adapters (spec §18 "Adapter interfaces"). The facade needs four operations for
 * projects, and three more to keep uploaded components for the next session (spec §8 "Loading
 * paths", §19); M06 adds the IndexedDB + sessionStorage adapter for browsers and a filesystem
 * adapter for Node.
 *
 * @typedef {object} ProjectRecord
 * @property {string} id
 * @property {string} name
 * @property {string} updatedAt ISO timestamp
 * @property {Record<string, any>} snapshot  core snapshot
 *
 * @typedef {object} StorageAdapter
 * @property {string} [kind]
 * @property {() => Promise<{id: string, name: string, updatedAt: string}[]>} list
 * @property {(id: string) => Promise<ProjectRecord|null>} load
 * @property {(record: ProjectRecord) => Promise<void>} save
 * @property {(id: string) => Promise<void>} remove
 * @property {() => Promise<object[]>} [loadComponents]  the uploaded component bundles it keeps
 * @property {(bundle: object) => Promise<void>} [saveComponent]  keeps a bundle, by id@version
 * @property {(typeRef: string) => Promise<void>} [removeComponent]  forgets one
 */

/**
 * Keeps projects and uploaded components in memory (serialised, so nothing is shared by
 * reference). Useful for tests, scripts and the console before persistence is configured.
 * @returns {StorageAdapter}
 * @example const strata = createStrata({ clock, storage: createMemoryStorage() })
 */
export function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const records = new Map()
  /** @type {Map<string, string>} bundles by id@version */
  const bundles = new Map()
  return {
    kind: 'memory',
    async list() {
      return [...records.values()]
        .map(text => JSON.parse(text))
        .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async load(id) {
      const text = records.get(id)
      return text ? JSON.parse(text) : null
    },
    async save(record) {
      records.set(record.id, JSON.stringify(record))
    },
    async remove(id) {
      records.delete(id)
    },
    async loadComponents() {
      return [...bundles.keys()]
        .sort()
        .map(key => JSON.parse(/** @type {string} */ (bundles.get(key))))
    },
    async saveComponent(bundle) {
      const { id, version } = /** @type {any} */ (bundle).manifest
      bundles.set(`${id}@${version}`, JSON.stringify(bundle))
    },
    async removeComponent(typeRef) {
      bundles.delete(typeRef)
    },
  }
}
