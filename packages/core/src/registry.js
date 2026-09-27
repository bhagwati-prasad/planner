/**
 * Component type registry. The core needs component manifests to create ports, validate
 * properties and find roll-up rules; strata-plugins (M4) adds the loaders (script tag,
 * local server, upload, filesystem) that fill this registry. Built-in base types register
 * through the same `register` call as user components: there is no private API (spec §1).
 */
import { fail, didYouMean, suggest } from './errors.js'
import { deepFreeze, isPlainObject, toPlain } from './plain.js'
import { checkSchema, ROLLUP_RULES, validateValue } from './props.js'
import { compareSemver, isSemver, satisfies } from './semver.js'
import { BUILTIN_MANIFESTS } from './builtins.js'

/** Version of the plugin API this core implements; manifests declare a compatible `strataApi` range. */
export const CORE_API_VERSION = '1.0.0'

export const PORT_DIRECTIONS = Object.freeze(['in', 'out', 'both'])
/** What a manifest describes: a component, or a connection type for edges (spec §7). */
export const PLUGIN_KINDS = Object.freeze(['component', 'connection-type'])
const ID_RE = /^[a-z0-9]+(?:[-_.:/][a-z0-9]+)*$/

/**
 * Splits 'acme.queue@1.2.0' into id and version.
 * @param {string} ref
 * @returns {{ id: string, version: string|null }}
 */
export function parseTypeRef(ref) {
  if (typeof ref !== 'string' || !ref)
    fail('INVALID', `Invalid component type reference ${JSON.stringify(ref)}`)
  const at = ref.lastIndexOf('@')
  if (at <= 0) return { id: ref, version: null }
  const version = ref.slice(at + 1)
  if (!isSemver(version)) fail('INVALID', `Invalid version in type reference '${ref}'`)
  return { id: ref.slice(0, at), version }
}

/** @param {{id: string, version: string}} manifest */
export const typeRefOf = manifest => `${manifest.id}@${manifest.version}`

/**
 * Checks a manifest's `methods.public` and `methods.private` (spec §8), and that each port
 * `exposes` only public methods (spec §6, ADR 0010).
 * @param {unknown} methods
 * @param {{ name: string, exposes?: unknown }[]} ports
 * @returns {string[]}
 */
function checkMethods(methods, ports) {
  const errors = []
  /** @type {Record<string, Record<string, unknown>>} */
  const groups = { public: {}, private: {} }
  if (methods !== undefined && !isPlainObject(methods))
    errors.push('methods must be an object with public and private methods')
  else
    for (const scope of /** @type {const} */ (['public', 'private'])) {
      const group = /** @type {Record<string, unknown>|undefined} */ (methods)?.[scope]
      if (group === undefined) continue
      if (!isPlainObject(group)) {
        errors.push(`methods.${scope} must be an object of method names`)
        continue
      }
      groups[scope] = /** @type {Record<string, unknown>} */ (group)
      for (const [name, spec] of Object.entries(group))
        if (!isPlainObject(spec)) errors.push(`methods.${scope}.${name} must be an object`)
    }
  for (const name of Object.keys(groups.private))
    if (name in groups.public) errors.push(`methods: '${name}' is both public and private`)
  for (const port of ports) {
    if (port.exposes === undefined) continue
    if (!Array.isArray(port.exposes) || port.exposes.some(e => typeof e !== 'string')) {
      errors.push(`port '${port.name}': exposes must be a list of public method names`)
      continue
    }
    for (const name of port.exposes)
      if (!(name in groups.public))
        errors.push(`port '${port.name}' exposes '${name}', which is not a public method`)
  }
  return errors
}

/**
 * Validates and normalises a manifest. Throws INVALID with every problem listed in `details`.
 * @param {unknown} input
 * @returns {Manifest}
 */
export function normalizeManifest(input) {
  const m = /** @type {Record<string, any>} */ (toPlain(input, 'manifest'))
  const errors = []
  if (!isPlainObject(m)) fail('INVALID', 'A manifest must be an object')
  if (typeof m.id !== 'string' || !ID_RE.test(m.id))
    errors.push(
      "id must be lowercase letters and digits separated by '.', ':', '/', '-' or '_' (e.g. 'acme.message-queue')"
    )
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('name is required')
  if (!isSemver(m.version)) errors.push('version must be a semantic version such as 1.2.0')
  if (m.strataApi !== undefined) {
    try {
      if (!satisfies(CORE_API_VERSION, m.strataApi))
        errors.push(
          `strataApi '${m.strataApi}' is not compatible with this core (API ${CORE_API_VERSION})`
        )
    } catch (err) {
      errors.push(`strataApi: ${err.message}`)
    }
  }
  if (m.kind !== undefined && !PLUGIN_KINDS.includes(m.kind))
    errors.push(`kind must be one of ${PLUGIN_KINDS.join(', ')}`)
  if (m.kind === 'connection-type' && Array.isArray(m.ports) && m.ports.length)
    errors.push('a connection type has no ports')
  if (m.extends !== undefined && m.extends !== null) {
    try {
      parseTypeRef(m.extends)
    } catch (err) {
      errors.push(`extends: ${err.message}`)
    }
  }

  const ports = []
  if (m.ports !== undefined && !Array.isArray(m.ports)) errors.push('ports must be a list')
  const seenPorts = new Set()
  for (const [i, p] of (Array.isArray(m.ports) ? m.ports : []).entries()) {
    if (!isPlainObject(p) || typeof p.name !== 'string' || !p.name) {
      errors.push(`ports[${i}].name is required`)
      continue
    }
    if (seenPorts.has(p.name)) errors.push(`ports[${i}]: duplicate port name '${p.name}'`)
    seenPorts.add(p.name)
    if (!PORT_DIRECTIONS.includes(p.direction))
      errors.push(`ports[${i}].direction must be in, out or both`)
    if (
      p.accepts !== undefined &&
      (!Array.isArray(p.accepts) || p.accepts.some(a => typeof a !== 'string'))
    )
      errors.push(`ports[${i}].accepts must be a list of connection type names`)
    ports.push({ ...p, name: p.name, direction: p.direction, accepts: p.accepts ?? [] })
  }

  errors.push(...checkMethods(m.methods, ports))

  const properties = m.properties ?? {}
  if (!isPlainObject(properties)) errors.push('properties must be an object')
  else
    for (const [key, schema] of Object.entries(properties))
      errors.push(...checkSchema(schema, `properties.${key}`))

  const metrics = m.metrics ?? {}
  if (!isPlainObject(metrics)) errors.push('metrics must be an object')
  else {
    for (const [key, metric] of Object.entries(metrics)) {
      if (!isPlainObject(metric)) {
        errors.push(`metrics.${key} must be an object`)
        continue
      }
      const rule = typeof metric.rollup === 'string' ? metric.rollup : metric.rollup?.rule
      if (metric.rollup !== undefined && !ROLLUP_RULES.includes(rule))
        errors.push(`metrics.${key}.rollup must be one of ${ROLLUP_RULES.join(', ')}`)
    }
  }

  if (errors.length)
    fail(
      'INVALID',
      `Invalid manifest${typeof m.id === 'string' ? ` '${m.id}'` : ''}: ${errors.join('; ')}`,
      errors
    )

  return deepFreeze({
    ...m,
    kind: m.kind ?? 'component',
    id: m.id,
    name: m.name.trim(),
    version: m.version,
    category: m.category ?? null,
    description: m.description ?? '',
    icon: m.icon ?? null,
    entry: m.entry ?? null,
    extends: m.extends ?? null,
    abstract: m.abstract === true,
    ports,
    // Defaults are stored like any value, in canonical units (eng §8, ADR 0008).
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, schema]) => [
        key,
        schema.default === undefined
          ? schema
          : { ...schema, default: validateValue(schema, schema.default, `properties.${key}`) },
      ])
    ),
    metrics,
  })
}

export class Registry {
  /** @type {Map<string, Map<string, Manifest>>} */
  #byId = new Map()
  /** @type {Map<string, EffectiveManifest>} */
  #effective = new Map()

  /**
   * Registers a manifest. Registering the same id@version again is an error unless `replace`.
   * @param {unknown} manifest
   * @param {{ replace?: boolean }} [options]
   * @returns {Manifest}
   */
  register(manifest, { replace = false } = {}) {
    const m = normalizeManifest(manifest)
    let versions = this.#byId.get(m.id)
    if (!versions) this.#byId.set(m.id, (versions = new Map()))
    if (versions.has(m.version) && !replace)
      fail('CONFLICT', `Component ${typeRefOf(m)} is already registered`)
    versions.set(m.version, m)
    this.#effective.clear()
    return m
  }

  /** @param {string} id @param {string} [version] */
  unregister(id, version) {
    const versions = this.#byId.get(id)
    if (!versions) return false
    const removed = version ? versions.delete(version) : versions.size > 0
    if (!version || versions.size === 0) this.#byId.delete(id)
    this.#effective.clear()
    return removed
  }

  /** @param {string} ref id or id@version */
  has(ref) {
    return this.get(ref) !== null
  }

  /**
   * The registered manifest (without inheritance applied), or null.
   * @param {string} ref id (latest version) or id@version
   * @returns {Manifest|null}
   */
  get(ref) {
    const { id, version } = parseTypeRef(ref)
    const versions = this.#byId.get(id)
    if (!versions) return null
    if (version) return versions.get(version) ?? null
    return latest(versions)
  }

  /** @param {string} id */
  versions(id) {
    return [...(this.#byId.get(id)?.keys() ?? [])].sort(compareSemver)
  }

  /**
   * The manifest with its `extends` chain merged in, or null if it is not registered.
   * @param {string} ref
   * @returns {EffectiveManifest|null}
   */
  resolve(ref) {
    const m = this.get(ref)
    if (!m) return null
    const key = typeRefOf(m)
    let eff = this.#effective.get(key)
    if (!eff) {
      eff = this.#merge(m)
      this.#effective.set(key, eff)
    }
    return eff
  }

  /**
   * Finds a type by id or by unambiguous short name: 'queue' finds 'acme.queue'. Concrete
   * components shadow the built-in base types, so 'queue' finds 'base:queue' only when no
   * other '…queue' is registered. Returns null when nothing matches.
   * @param {string} name
   * @param {{ kind?: 'component'|'connection-type' }} [options]  only types of this kind
   * @returns {Manifest|null}
   */
  find(name, { kind } = {}) {
    const direct = this.get(name)
    if (direct) return !kind || direct.kind === kind ? direct : null
    const { id, version } = parseTypeRef(name)
    let matches = [...this.#byId.keys()].filter(
      k => /[.:/]/.test(k) && [...'.:/'].some(sep => k.endsWith(sep + id))
    )
    if (kind)
      matches = matches.filter(
        k => latest(/** @type {Map<string, Manifest>} */ (this.#byId.get(k)))?.kind === kind
      )
    if (matches.length > 1 && matches.some(k => !k.startsWith('base:')))
      matches = matches.filter(k => !k.startsWith('base:'))
    if (matches.length > 1)
      fail(
        'AMBIGUOUS',
        `'${id}' matches several component types: ${matches.sort().join(', ')}. Use the full id.`,
        matches
      )
    if (matches.length === 0) return null
    return this.get(version ? `${matches[0]}@${version}` : matches[0])
  }

  /**
   * Like `find`, but throws NOT_FOUND with suggestions.
   * @param {string} name
   * @param {{ kind?: 'component'|'connection-type' }} [options]
   */
  require(name, options = {}) {
    const m = this.find(name, options)
    if (m) return m
    const ids = [...this.#byId.keys()].filter(
      k => !options.kind || this.get(k)?.kind === options.kind
    )
    const shortNames = ids.map(k => k.split(/[.:/]/).pop())
    return fail(
      'NOT_FOUND',
      `Unknown component type '${name}'.${didYouMean(suggest(name, [...ids, ...shortNames]))}`
    )
  }

  /**
   * True when `ref` is `baseId` or inherits from it.
   * @param {string} ref
   * @param {string} baseId
   */
  isA(ref, baseId) {
    const eff = this.resolve(ref)
    return !!eff && eff.lineage.includes(parseTypeRef(baseId).id)
  }

  /**
   * Latest version of every registered type, sorted by id.
   * @param {{ kind?: 'component'|'connection-type' }} [options]
   */
  list({ kind } = {}) {
    const all = [...this.#byId.keys()]
      .sort()
      .map(
        id =>
          /** @type {Manifest} */ (
            latest(/** @type {Map<string, Manifest>} */ (this.#byId.get(id)))
          )
      )
    return kind ? all.filter(m => m.kind === kind) : all
  }

  /** @param {Manifest} m @returns {EffectiveManifest} */
  #merge(m) {
    const chain = [m]
    const seen = new Set([m.id])
    let missingBase = null
    let cur = m
    while (cur.extends) {
      const base = this.get(cur.extends)
      if (!base) {
        missingBase = cur.extends
        break
      }
      if (seen.has(base.id))
        fail('CYCLE', `Component '${m.id}' has a circular 'extends' chain through '${base.id}'`)
      seen.add(base.id)
      chain.push(base)
      cur = base
    }
    /** @type {Record<string, any>} */
    const ports = {}
    const properties = {}
    const metrics = {}
    for (const layer of [...chain].reverse()) {
      for (const p of layer.ports) ports[p.name] = { ...(ports[p.name] ?? {}), ...p }
      for (const [k, s] of Object.entries(layer.properties))
        properties[k] = { ...(properties[k] ?? {}), ...s }
      for (const [k, s] of Object.entries(layer.metrics))
        metrics[k] = { ...(metrics[k] ?? {}), ...s }
    }
    return /** @type {EffectiveManifest} */ (
      deepFreeze({
        ...m,
        typeRef: typeRefOf(m),
        lineage: chain.map(c => c.id),
        missingBase,
        category: m.category ?? chain.find(c => c.category)?.category ?? null,
        icon: m.icon ?? chain.find(c => c.icon)?.icon ?? null,
        ports: Object.values(ports),
        properties,
        metrics,
      })
    )
  }
}

/** @param {Map<string, Manifest>} versions */
function latest(versions) {
  let best = null
  for (const [version, m] of versions)
    if (!best || compareSemver(version, best.version) > 0) best = m
  return best
}

/**
 * Creates a registry, by default pre-loaded with the built-in base types (base:service, ...).
 * @param {{ builtins?: boolean }} [options]
 */
export function createRegistry({ builtins = true } = {}) {
  const registry = new Registry()
  if (builtins) for (const m of BUILTIN_MANIFESTS) registry.register(m)
  return registry
}

/**
 * @typedef {object} PortSpec
 * @property {string} name
 * @property {'in'|'out'|'both'} direction
 * @property {string[]} accepts   connection types; empty means any
 * @property {string[]} [exposes]  the public methods a message on this port can call (spec §6)
 *
 * @typedef {object} Manifest
 * @property {'component'|'connection-type'} kind
 * @property {string} id
 * @property {string} name
 * @property {string} version
 * @property {string|null} category
 * @property {string} description
 * @property {string|null} icon
 * @property {string|null} entry
 * @property {string|null} extends
 * @property {boolean} abstract
 * @property {PortSpec[]} ports
 * @property {Record<string, import('./props.js').PropertySchema>} properties
 * @property {{ public?: Record<string, object>, private?: Record<string, object> }} [methods]  spec §8
 * @property {Record<string, {unit?: string, rollup?: string, description?: string, estimate?: string}>} metrics  `estimate` names the property that estimates the metric until simulation measures it
 * @property {string} [shape]    diagram shape name (strata-graph); defaults by base type
 * @property {string} [iconSvg]  icon markup, attached when a packed bundle is registered (M4)
 *
 * @typedef {Manifest & { typeRef: string, lineage: string[], missingBase: string|null }} EffectiveManifest
 */
