/**
 * Entity store (spec §5). Entities are frozen plain objects kept in one table per kind, with
 * secondary indexes on their parent references. Every entity carries a ULID `id`,
 * `createdBy`, `createdAt`, `updatedBy`, `updatedAt` and a per-entity `rev`.
 *
 * The store is only mutated through a Tx, which records the previous value of everything it
 * touches. That record gives rollback on failure and the inverse used for undo.
 */
import { fail } from './errors.js'
import { deepEqual, deepFreeze, toPlain } from './plain.js'

/** Version 2 stores property values in canonical units (ADR 0008). */
export const SCHEMA_VERSION = 2

/**
 * Entity kinds, the snapshot table each is stored under, and the fields indexed for lookups.
 * Later milestones add kinds (annotations and threads in M6, docs and tickets in R2).
 */
export const ENTITY_KINDS = Object.freeze({
  project: { table: 'project', single: true, indexes: [] },
  system: { table: 'systems', indexes: ['ownerNodeId'] },
  node: { table: 'nodes', indexes: ['systemId', 'systemRef'] },
  port: { table: 'ports', indexes: ['nodeId', 'boundaryPortId'] },
  edge: { table: 'edges', indexes: ['systemId', 'fromPort', 'toPort'] },
  boundaryPort: { table: 'boundaryPorts', indexes: ['systemId', 'internalPortId'] },
  view: { table: 'views', indexes: ['systemId'] },
})

export const META_FIELDS = Object.freeze([
  'id',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
  'rev',
])

const LABELS = { boundaryPort: 'Boundary port' }
const label = kind => LABELS[kind] ?? kind[0].toUpperCase() + kind.slice(1)
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export class Store {
  /** @type {Map<string, Map<string, any>>} */
  #tables = new Map()
  /** @type {Map<string, Map<string, Map<unknown, Set<string>>>>} */
  #indexes = new Map()
  /** @type {Record<string, {table: string, single?: boolean, indexes: string[]}>} */
  #kinds

  /** Model revision: incremented once per applied operation. */
  rev = 0

  /** @param {{ kinds?: Record<string, {table: string, single?: boolean, indexes: string[]}> }} [options] */
  constructor({ kinds = ENTITY_KINDS } = {}) {
    this.#kinds = kinds
    for (const [kind, def] of Object.entries(kinds)) {
      this.#tables.set(kind, new Map())
      this.#indexes.set(kind, new Map(def.indexes.map(field => [field, new Map()])))
    }
  }

  /** Entity kinds this store holds. */
  get kinds() {
    return Object.keys(this.#kinds)
  }

  #table(kind) {
    const table = this.#tables.get(kind)
    if (!table) fail('INVALID', `Unknown entity kind '${kind}'`)
    return table
  }

  /** @param {string} kind @param {string} id */
  get(kind, id) {
    return this.#table(kind).get(id)
  }

  /** @param {string} kind @param {string} id */
  has(kind, id) {
    return this.#table(kind).has(id)
  }

  /**
   * @param {string} kind
   * @param {string} id
   */
  require(kind, id) {
    const entity = this.#table(kind).get(id)
    if (!entity) fail('NOT_FOUND', `${label(kind)} '${id}' not found`, { kind, id })
    return entity
  }

  /** All entities of a kind, in id (creation) order. @param {string} kind */
  all(kind) {
    return [...this.#table(kind).values()].sort(byId)
  }

  /** @param {string} kind */
  count(kind) {
    return this.#table(kind).size
  }

  /**
   * Entities whose indexed `field` equals `value`, in id order.
   * @param {string} kind
   * @param {string} field
   * @param {unknown} value
   */
  find(kind, field, value) {
    const index = this.#indexes.get(kind)?.get(field)
    if (!index) fail('INVALID', `'${kind}.${field}' is not indexed`)
    const ids = index.get(value)
    if (!ids) return []
    const table = this.#table(kind)
    return [...ids].map(id => table.get(id)).sort(byId)
  }

  /** @internal Writes an entity and maintains indexes. Use a Tx instead. */
  _put(kind, entity) {
    const table = this.#table(kind)
    const prev = table.get(entity.id)
    if (prev) this.#unindex(kind, prev)
    table.set(entity.id, entity)
    for (const [field, index] of /** @type {Map<string, Map<unknown, Set<string>>>} */ (
      this.#indexes.get(kind)
    )) {
      const value = entity[field]
      if (value === undefined || value === null) continue
      let ids = index.get(value)
      if (!ids) index.set(value, (ids = new Set()))
      ids.add(entity.id)
    }
  }

  /** @internal Removes an entity and its index entries. Use a Tx instead. */
  _delete(kind, id) {
    const table = this.#table(kind)
    const prev = table.get(id)
    if (!prev) return
    this.#unindex(kind, prev)
    table.delete(id)
  }

  #unindex(kind, entity) {
    for (const [field, index] of /** @type {Map<string, Map<unknown, Set<string>>>} */ (
      this.#indexes.get(kind)
    )) {
      const ids = index.get(entity[field])
      if (!ids) continue
      ids.delete(entity.id)
      if (ids.size === 0) index.delete(entity[field])
    }
  }

  /**
   * A JSON-ready copy of the whole model: `{ schemaVersion, rev, project, systems, nodes, ... }`.
   * Tables are sorted by id so equal models produce identical snapshots.
   */
  snapshot() {
    const out = { schemaVersion: SCHEMA_VERSION, rev: this.rev }
    for (const [kind, def] of Object.entries(this.#kinds)) {
      const rows = this.all(kind)
      out[def.table] = def.single ? (rows[0] ?? null) : rows
    }
    return /** @type {Record<string, any>} */ (JSON.parse(JSON.stringify(out)))
  }

  /**
   * Replaces the contents with a snapshot produced by `snapshot()`.
   * @param {Record<string, any>} snapshot
   */
  load(snapshot) {
    const snap = toPlain(snapshot, 'snapshot')
    if (snap.schemaVersion !== SCHEMA_VERSION) {
      fail(
        'UNSUPPORTED',
        `Snapshot schema version ${snap.schemaVersion} is not supported (expected ${SCHEMA_VERSION})`
      )
    }
    this.clear()
    for (const [kind, def] of Object.entries(this.#kinds)) {
      const rows = def.single ? (snap[def.table] ? [snap[def.table]] : []) : (snap[def.table] ?? [])
      if (!Array.isArray(rows)) fail('INVALID', `snapshot.${def.table} must be a list`)
      for (const row of rows) {
        if (typeof row?.id !== 'string')
          fail('INVALID', `snapshot.${def.table} contains an entity without an id`)
        this._put(kind, deepFreeze(row))
      }
    }
    this.rev = Number.isInteger(snap.rev) ? snap.rev : 0
  }

  clear() {
    for (const table of this.#tables.values()) table.clear()
    for (const indexes of this.#indexes.values())
      for (const index of indexes.values()) index.clear()
    this.rev = 0
  }
}

/**
 * A unit of change against the store. Handlers read and write through it; the command bus
 * commits it as one operation, or rolls it back if the handler throws.
 */
export class Tx {
  #store
  /** @type {Map<string, {kind: string, id: string, value: any}>} key → value before this tx */
  #before = new Map()
  /** @type {Map<string, {kind: string, id: string, value: any}>[]} journals: the tx, then open savepoints */
  #journals = [this.#before]

  /**
   * @param {Store} store
   * @param {{ actorId: string, timestamp: string }} meta
   */
  constructor(store, { actorId, timestamp }) {
    this.#store = store
    this.actorId = actorId
    this.timestamp = timestamp
  }

  get(kind, id) {
    return this.#store.get(kind, id)
  }
  has(kind, id) {
    return this.#store.has(kind, id)
  }
  require(kind, id) {
    return this.#store.require(kind, id)
  }
  all(kind) {
    return this.#store.all(kind)
  }
  find(kind, field, value) {
    return this.#store.find(kind, field, value)
  }
  count(kind) {
    return this.#store.count(kind)
  }

  #record(kind, id) {
    const key = `${kind}\u0000${id}`
    const value = this.#store.get(kind, id) ?? null
    for (const journal of this.#journals)
      if (!journal.has(key)) journal.set(key, { kind, id, value })
  }

  /** Opens a savepoint; returns a token for `release` or `rollbackTo`. */
  savepoint() {
    this.#journals.push(new Map())
    return this.#journals.length - 1
  }

  /** Keeps the changes made since the savepoint. @param {number} token */
  release(token) {
    if (token !== this.#journals.length - 1 || token === 0)
      fail('INVALID', 'Savepoints must be released in reverse order')
    this.#journals.pop()
  }

  /** Undoes the changes made since the savepoint and closes it. @param {number} token */
  rollbackTo(token) {
    if (token !== this.#journals.length - 1 || token === 0)
      fail('INVALID', 'Savepoints must be rolled back in reverse order')
    const journal = /** @type {Map<string, any>} */ (this.#journals.pop())
    for (const { kind, id, value } of [...journal.values()].reverse()) {
      if (value) this.#store._put(kind, value)
      else this.#store._delete(kind, id)
    }
  }

  /**
   * Creates an entity. `fields.id` is required; metadata is stamped here.
   * @param {string} kind
   * @param {Record<string, any>} fields
   */
  create(kind, fields) {
    const { id } = fields
    if (typeof id !== 'string' || !id) fail('INVALID', `Cannot create a ${kind} without an id`)
    if (this.#store.has(kind, id)) fail('CONFLICT', `${label(kind)} '${id}' already exists`)
    const entity = deepFreeze({
      ...stripUndefined(fields),
      id,
      createdBy: this.actorId,
      createdAt: this.timestamp,
      updatedBy: this.actorId,
      updatedAt: this.timestamp,
      rev: 1,
    })
    this.#record(kind, id)
    this.#store._put(kind, entity)
    return entity
  }

  /**
   * Shallow-merges `changes` into an entity. Returns the entity unchanged (and records
   * nothing) when every change equals the current value.
   * @param {string} kind
   * @param {string} id
   * @param {Record<string, any>} changes
   */
  update(kind, id, changes) {
    const cur = this.#store.require(kind, id)
    const clean = stripUndefined(changes)
    for (const key of Object.keys(clean)) {
      if (META_FIELDS.includes(key))
        fail('INVALID', `'${key}' is managed by the store and cannot be changed`)
    }
    if (Object.keys(clean).every(key => deepEqual(cur[key], clean[key]))) return cur
    const next = deepFreeze({
      ...cur,
      ...clean,
      updatedBy: this.actorId,
      updatedAt: this.timestamp,
      rev: cur.rev + 1,
    })
    this.#record(kind, id)
    this.#store._put(kind, next)
    return next
  }

  /** @param {string} kind @param {string} id */
  remove(kind, id) {
    this.#store.require(kind, id)
    this.#record(kind, id)
    this.#store._delete(kind, id)
  }

  /**
   * Writes a previously captured value back (null deletes). Used by undo and redo; the
   * entity's `rev` still moves forward so replicas can order the change.
   * @param {string} kind
   * @param {string} id
   * @param {Record<string, any>|null} value
   */
  restore(kind, id, value) {
    const cur = this.#store.get(kind, id)
    if (value === null) {
      if (!cur) return
      this.#record(kind, id)
      this.#store._delete(kind, id)
      return
    }
    if (value.id !== id) fail('INVALID', `Restore of ${kind} '${id}' carries a different id`)
    if (cur && deepEqual(stripMeta(cur), stripMeta(value))) return
    this.#record(kind, id)
    this.#store._put(
      kind,
      deepFreeze({
        ...value,
        updatedBy: this.actorId,
        updatedAt: this.timestamp,
        rev: Math.max(cur?.rev ?? 0, value.rev ?? 0) + 1,
      })
    )
  }

  /** True when the tx has changed anything. */
  get changed() {
    for (const { kind, id, value } of this.#before.values()) {
      if ((this.#store.get(kind, id) ?? null) !== value) return true
    }
    return false
  }

  /**
   * Net changes: create, update or delete per touched entity (a create followed by a delete
   * in the same tx is omitted).
   * @returns {{kind: string, id: string, action: 'create'|'update'|'delete'}[]}
   */
  changes() {
    const out = []
    for (const { kind, id, value } of this.#before.values()) {
      const after = this.#store.get(kind, id) ?? null
      if (after === value) continue
      if (!value && !after) continue
      out.push({
        kind,
        id,
        action: /** @type {'create'|'update'|'delete'} */ (
          !value ? 'create' : !after ? 'delete' : 'update'
        ),
      })
    }
    return out
  }

  /**
   * The values to restore to undo this tx, as `{ kind, id, value }` (value null = delete).
   */
  inverse() {
    const out = []
    for (const { kind, id, value } of this.#before.values()) {
      if ((this.#store.get(kind, id) ?? null) !== value) out.push({ kind, id, value })
    }
    return out
  }

  /** Puts every touched entity back as it was before the tx. */
  rollback() {
    for (const { kind, id, value } of [...this.#before.values()].reverse()) {
      if (value) this.#store._put(kind, value)
      else this.#store._delete(kind, id)
    }
    this.#before.clear()
    this.#journals = [this.#before]
  }
}

function stripUndefined(obj) {
  const out = {}
  for (const key of Object.keys(obj)) if (obj[key] !== undefined) out[key] = obj[key]
  return out
}

function stripMeta(entity) {
  const out = { ...entity }
  for (const key of META_FIELDS) if (key !== 'id') delete out[key]
  return out
}
