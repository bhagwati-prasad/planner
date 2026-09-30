// @ts-check
/**
 * A node's state at run time (spec §6 "State", task 0404). It starts from the manifest's initial
 * values, then fixtures, then the instance's overrides, each checked against the field's schema.
 * Methods reach it through a view that checks every write against the schema of the part it
 * writes (a queue's or list's items, a map's values, a table's rows and cells, with unique keys),
 * refuses fields the manifest does not declare in development builds, and reports every change
 * so the run can record it for the debugger. What leaves a node, a message body or a response,
 * is a copy, so no other node reaches its state.
 */
import { StrataError, checkValue } from '../../core/src/index.js'

/**
 * @typedef {import('../../core/src/schema.js').Schema} Schema
 * @typedef {(op: 'set'|'delete', path: (string|number)[], value?: unknown) => void} Recorder
 */

/** Each state view → the object it shows. */
const TARGETS = new WeakMap()

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = v => typeof v === 'object' && v !== null

/**
 * A value with the objects that state views show in place of the views.
 * @param {unknown} value
 */
function bare(value) {
  if (!isObject(value)) return value
  const target = TARGETS.get(value) ?? value
  for (const key of Object.keys(target)) {
    const inner = target[key]
    const unwrapped = bare(inner)
    if (unwrapped !== inner) target[key] = unwrapped
  }
  return target
}

/**
 * A deep copy of a value that may hold state views: what leaves a node.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function copy(value) {
  if (!isObject(value)) return value
  const target = TARGETS.get(/** @type {object} */ (value)) ?? value
  if (Array.isArray(target)) return /** @type {any} */ (target.map(copy))
  if (Object.getPrototypeOf(target) === Object.prototype || Object.getPrototypeOf(target) === null)
    return /** @type {any} */ (
      Object.fromEntries(Object.entries(target).map(([k, v]) => [k, copy(v)]))
    )
  return structuredClone(target)
}

/**
 * The value checked against its schema, in canonical units, or the schema error thrown.
 * @param {Schema} schema @param {unknown} value @param {string} name
 */
function check(schema, value, name) {
  const result = checkValue(schema, value, name)
  if (result.ok === false)
    throw new StrataError(result.code, String(result.details.message), result.details)
  return result.value
}

/** A path inside state as text: state.orders[0].qty. @param {(string|number)[]} path */
const named = path => `state${path.map(p => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('')}`

/** The key column of a table. @param {Schema} table */
const keyOf = table => table.key ?? ('id' in (table.columns ?? {}) ? 'id' : undefined)

/**
 * The rows of a CSV text as objects, each cell typed by its column (RFC 4180 quoting).
 * @param {string} text @param {Record<string, Schema>} columns
 */
export function csvRows(text, columns) {
  /** @type {string[][]} */
  const rows = []
  /** @type {string[]} */
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (text[i + 1] === '"') cell += text[i++]
      else quoted = false
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      rows.push([...row, cell])
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  const [header = [], ...body] = rows
  /** @param {string} column @param {string} text */
  const typed = (column, text) => {
    const type = columns[column]?.type
    if (type === 'integer' || type === 'number') return Number(text)
    if (type === 'boolean') return text === 'true' ? true : text === 'false' ? false : text
    return text
  }
  return body.map(cells => Object.fromEntries(header.map((c, i) => [c, typed(c, cells[i])])))
}

/**
 * A node's initial state: the manifest's initial values, then its fixtures (a table's rows from
 * CSV), then its instance overrides, each checked against the field's schema.
 * @param {Record<string, Schema>} fields  the manifest's state schema
 * @param {{ state?: Record<string, unknown>, fixtures?: Record<string, { csv: string }> }} [instance]
 * @returns {Record<string, unknown>}
 */
export function initialState(fields, { state = {}, fixtures = {} } = {}) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [name, schema] of Object.entries(fields)) out[name] = structuredClone(schema.initial)
  for (const [name, fixture] of Object.entries(fixtures))
    out[name] = csvRows(fixture.csv, fields[name]?.columns ?? {})
  Object.assign(out, structuredClone(state))
  for (const [name, schema] of Object.entries(fields))
    out[name] = check(schema, out[name], `state.${name}`)
  return out
}

/**
 * The schema of a field's part at `rest`, the path inside the field: a table row is
 * `{ row: table }`. Undefined where the schema does not describe the part.
 * @param {Schema|undefined} field @param {(string|number)[]} rest
 * @returns {Schema | { row: Schema } | undefined}
 */
function partOf(field, rest) {
  /** @type {any} */
  let schema = field
  for (const step of rest) {
    if (!schema) return undefined
    if (schema.row) schema = schema.row.columns?.[step]
    else if (schema.type === 'list' || schema.type === 'queue')
      schema = typeof step === 'number' ? (schema.items ?? schema.of) : undefined
    else if (schema.type === 'map') schema = schema.values
    else if (schema.type === 'table')
      schema = typeof step === 'number' ? { row: schema } : undefined
    else return undefined
    if (typeof schema === 'string') schema = { type: schema }
  }
  return schema
}

/**
 * A table row checked against the table's columns: every column present and of its type, and
 * no other.
 * @param {Schema} table @param {unknown} value @param {string} name
 */
function checkRow(table, value, name) {
  const columns = table.columns ?? {}
  if (!isObject(value) || Array.isArray(value))
    throw new StrataError('E_SCHEMA_TYPE', `${name} must be a row object`)
  /** @type {Record<string, unknown>} */
  const row = {}
  for (const [column, schema] of Object.entries(columns)) {
    if (!(column in value)) throw new StrataError('E_SCHEMA_FIELD', `${name}.${column} is missing`)
    row[column] = check(schema, value[column], `${name}.${column}`)
  }
  const extra = Object.keys(value).find(column => !(column in columns))
  if (extra)
    throw new StrataError('E_SCHEMA_FIELD', `${name}.${extra} is not a column of the table`)
  return row
}

/**
 * The value to store for a write, checked against the part of the field it writes.
 * @param {Record<string, unknown>} root  the node's state
 * @param {Record<string, Schema>} fields
 * @param {(string|number)[]} at  the path written
 * @param {any} holder  the object written into
 * @param {unknown} value
 */
function checked(root, fields, at, holder, value) {
  const [field, ...rest] = at
  const key = rest.at(-1)
  if (key === 'length' && Array.isArray(holder)) return value
  const part = /** @type {any} */ (partOf(fields[field], rest))
  if (!part) {
    const row = /** @type {any} */ (partOf(fields[field], rest.slice(0, -1)))
    if (row?.row)
      throw new StrataError('E_SCHEMA_FIELD', `${named(at)} is not a column of the table`)
    return value
  }
  if (part.row) {
    // A whole row: rows the table already holds are moving (splice, sort), new ones are checked.
    if (holder.includes(value)) return value
    const row = checkRow(part.row, value, named(at))
    const key = keyOf(part.row)
    if (key !== undefined && holder.some((/** @type {any} */ r) => r[key] === row[key]))
      throw new StrataError(
        'E_SCHEMA_KEY',
        `${named(at)}.${key} repeats the key ${JSON.stringify(row[key])}`
      )
    return row
  }
  const cell = check(part, value, named(at))
  const table = /** @type {any} */ (partOf(fields[field], rest.slice(0, -2)))
  if (table?.type === 'table' && rest.length >= 2 && keyOf(table) === key) {
    const rows = /** @type {any[]} */ (root[field])
    if (rows.some(r => r !== holder && r[key] === cell))
      throw new StrataError('E_SCHEMA_KEY', `${named(at)} repeats the key ${JSON.stringify(cell)}`)
  }
  return cell
}

/**
 * A view of a node's state for one method call: it checks writes, refuses undeclared fields when
 * `strict`, and reports each change to `record`.
 * @param {Record<string, unknown>} root  the node's state
 * @param {{ node: string, fields: Record<string, Schema>, strict: boolean, record: Recorder }} options
 */
export function stateView(root, { node, fields, strict, record }) {
  /** @param {any} target @param {(string|number)[]} path */
  const watch = (target, path) => {
    /** @param {string|symbol} key */
    const at = key => [
      ...path,
      Array.isArray(target) && /^\d+$/.test(String(key)) ? Number(key) : String(key),
    ]
    const view = new Proxy(target, {
      get(obj, key) {
        const value = obj[key]
        return isObject(value) && typeof key === 'string' ? watch(value, at(key)) : value
      },
      set(obj, key, value) {
        if (typeof key === 'symbol') return Reflect.set(obj, key, value)
        const path = at(key)
        if (path.length === 1 && !(key in fields)) {
          if (strict)
            throw new StrataError(
              'E_BEHAVIOUR_UNDECLARED_STATE',
              `state.${key} is not declared in the manifest of ${node}; declare it under state with a type and an initial value`
            )
          obj[key] = bare(value)
        } else obj[key] = checked(root, fields, path, obj, bare(value))
        record('set', path, obj[key])
        return true
      },
      deleteProperty(obj, key) {
        delete obj[key]
        if (typeof key === 'string') record('delete', at(key))
        return true
      },
    })
    TARGETS.set(view, target)
    return view
  }
  return watch(root, [])
}
