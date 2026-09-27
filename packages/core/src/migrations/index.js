// @ts-check
/**
 * Snapshot migrations (eng §8): each is a pure function in vN-to-vN+1.js, tested against the
 * fixtures in test/fixtures/schema-vN/. A released migration is never edited or deleted.
 */
import { fail } from '../errors.js'
import { SCHEMA_VERSION } from '../store.js'
import { v1ToV2 } from './v1-to-v2.js'
import { v2ToV3 } from './v2-to-v3.js'

/** @type {Record<number, (snapshot: Record<string, any>, context: { registry: import('../registry.js').Registry }) => Record<string, any>>} */
const MIGRATIONS = { 1: v1ToV2, 2: v2ToV3 }

/**
 * Brings a snapshot from any earlier schema version up to the current one, one version at a
 * time. A current snapshot is returned as it is; a newer one is left for the store to refuse.
 * @param {Record<string, any>} snapshot
 * @param {{ registry: import('../registry.js').Registry }} context  the component types, whose
 *   property schemas say how values convert
 * @returns {Record<string, any>}
 */
export function migrateSnapshot(snapshot, { registry }) {
  let out = snapshot
  while (out.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[out.schemaVersion]
    if (!step)
      fail('UNSUPPORTED', `No migration from snapshot schema version ${out.schemaVersion}`, {
        schemaVersion: out.schemaVersion,
      })
    out = step(out, { registry })
  }
  return out
}
