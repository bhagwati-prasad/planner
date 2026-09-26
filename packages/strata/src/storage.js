/**
 * Storage adapters (spec §16 "Adapter interfaces"). The facade needs four operations; M5
 * adds the IndexedDB + sessionStorage adapter for browsers and a filesystem adapter for Node.
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
 */

/**
 * Keeps projects in memory (serialised, so nothing is shared by reference). Useful for tests,
 * scripts and the console before persistence is configured.
 * @returns {StorageAdapter}
 */
export function createMemoryStorage () {
  /** @type {Map<string, string>} */
  const records = new Map()
  return {
    kind: 'memory',
    async list () {
      return [...records.values()]
        .map(text => JSON.parse(text))
        .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async load (id) {
      const text = records.get(id)
      return text ? JSON.parse(text) : null
    },
    async save (record) {
      records.set(record.id, JSON.stringify(record))
    },
    async remove (id) {
      records.delete(id)
    }
  }
}
