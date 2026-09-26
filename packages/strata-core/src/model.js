/**
 * Read helpers over the model. Each takes a source with `get`, `require`, `all` and `find`
 * (a Store, or a Tx while a command runs), so handlers and queries share one implementation.
 */
import { fail } from './errors.js'
import { defaultProps } from './props.js'

export const NODE_STATUSES = Object.freeze(['planned', 'existing', 'deprecated'])
export const LEVEL_TAGS = Object.freeze(['context', 'container', 'component', 'custom'])
export const VIEW_KINDS = Object.freeze(['logical', 'deployment', 'dataflow', 'custom'])
export const PLACEMENTS = Object.freeze(['reference', 'value'])

/** Maximum boundary-port hops followed when resolving a port; recursion depth is unlimited in principle, this only guards corrupt data. */
const MAX_PORT_HOPS = 256

/**
 * @typedef {{ get(kind: string, id: string): any, require(kind: string, id: string): any, all(kind: string): any[], find(kind: string, field: string, value: unknown): any[] }} Source
 */

/** @param {Source} src */
export function projectOf (src) {
  return src.all('project')[0] ?? null
}

/** @param {Source} src */
export function requireProject (src) {
  const project = projectOf(src)
  if (!project) fail('NOT_FOUND', 'The model has no project; dispatch project.init first')
  return project
}

/** @param {Source} src @param {string} systemId */
export const nodesOf = (src, systemId) => src.find('node', 'systemId', systemId)
/** @param {Source} src @param {string} systemId */
export const edgesOf = (src, systemId) => src.find('edge', 'systemId', systemId)
/** @param {Source} src @param {string} nodeId */
export const portsOf = (src, nodeId) => src.find('port', 'nodeId', nodeId)
/** @param {Source} src @param {string} systemId */
export const boundaryPortsOf = (src, systemId) => src.find('boundaryPort', 'systemId', systemId)
/** @param {Source} src @param {string} systemId */
export const viewsOf = (src, systemId) => src.find('view', 'systemId', systemId)
/** Composite nodes that place `systemId`. @param {Source} src @param {string} systemId */
export const referencingNodes = (src, systemId) => src.find('node', 'systemRef', systemId)

/** Edges attached to a port, in id order. @param {Source} src @param {string} portId */
export function edgesAtPort (src, portId) {
  const seen = new Map()
  for (const e of src.find('edge', 'fromPort', portId)) seen.set(e.id, e)
  for (const e of src.find('edge', 'toPort', portId)) seen.set(e.id, e)
  return [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** @param {Source} src @param {string} nodeId @param {string} name */
export function portByName (src, nodeId, name) {
  return portsOf(src, nodeId).find(p => p.name === name) ?? null
}

/** @param {Source} src @param {string} portId */
export function nodeOfPort (src, portId) {
  return src.require('node', src.require('port', portId).nodeId)
}

/** The system a port's node lives in. @param {Source} src @param {string} portId */
export function systemOfPort (src, portId) {
  return nodeOfPort(src, portId).systemId
}

/** Systems placed directly inside `systemId`, in node order. @param {Source} src @param {string} systemId */
export function childSystemIds (src, systemId) {
  return nodesOf(src, systemId).filter(n => n.kind === 'composite').map(n => n.systemRef)
}

/**
 * True when `outer` contains `inner` at any depth (not counting outer === inner).
 * @param {Source} src
 * @param {string} outer
 * @param {string} inner
 */
export function containsSystem (src, outer, inner) {
  const seen = new Set()
  const stack = [...childSystemIds(src, outer)]
  while (stack.length) {
    const id = /** @type {string} */ (stack.pop())
    if (id === inner) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...childSystemIds(src, id))
  }
  return false
}

/**
 * True when placing `childId` inside `containerId` would make a system contain itself.
 * @param {Source} src
 * @param {string} containerId
 * @param {string} childId
 */
export function wouldCycle (src, containerId, childId) {
  return containerId === childId || containsSystem(src, childId, containerId)
}

/**
 * `systemId` and every system below it, depth-first, each once.
 * @param {Source} src
 * @param {string} systemId
 */
export function subtreeSystemIds (src, systemId) {
  const out = []
  const seen = new Set()
  const visit = id => {
    if (seen.has(id)) return
    seen.add(id)
    out.push(id)
    for (const child of childSystemIds(src, id)) visit(child)
  }
  visit(systemId)
  return out
}

/**
 * Every path from the root system down to `systemId`, as lists of `{ systemId, viaNodeId }`.
 * A system placed by reference in several places has several paths; a library system that
 * is not placed anywhere has none.
 * @param {Source} src
 * @param {string} systemId
 * @param {{ limit?: number }} [options]
 */
export function pathsTo (src, systemId, { limit = 100 } = {}) {
  const rootId = requireProject(src).rootSystemId
  /** @type {{systemId: string, viaNodeId: string|null}[][]} */
  const out = []
  const walk = (id, suffix, seen) => {
    if (out.length >= limit) return
    if (id === rootId) {
      out.push([{ systemId: rootId, viaNodeId: null }, ...suffix])
      return
    }
    for (const node of referencingNodes(src, id)) {
      if (seen.has(node.systemId)) continue
      walk(node.systemId, [{ systemId: id, viaNodeId: node.id }, ...suffix], new Set([...seen, node.systemId]))
    }
  }
  walk(systemId, [], new Set([systemId]))
  return out
}

/**
 * Whether a system is a library system: neither the root nor owned by a composite node.
 * @param {Source} src
 * @param {{ id: string, ownerNodeId: string|null }} system
 */
export function isLibrarySystem (src, system) {
  return !system.ownerNodeId && system.id !== projectOf(src)?.rootSystemId
}

/**
 * The resolved component manifest of an atomic node, or null (composite, placeholder).
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ kind: string, typeRef: string|null }} node
 */
export function manifestOf (registry, node) {
  if (node.kind !== 'atomic' || !node.typeRef || !registry) return null
  return registry.resolve(node.typeRef)
}

/**
 * The connection type of an edge, with inheritance applied, or null when the edge has none or
 * it is not installed. Connection types resolve by id (latest version).
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ connectionType: string|null }} edge
 */
export function connectionTypeOf (registry, edge) {
  if (!edge.connectionType || !registry) return null
  let found = null
  try {
    found = registry.find(edge.connectionType, { kind: 'connection-type' })
  } catch {
    return null
  }
  return found ? registry.resolve(`${found.id}@${found.version}`) : null
}

/**
 * The manifest that describes an entity's properties: a node's component type or an edge's
 * connection type.
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {any} entity
 */
function describedBy (registry, entity) {
  return 'fromPort' in entity ? connectionTypeOf(registry, entity) : manifestOf(registry, entity)
}

/**
 * Property values after defaults: manifest defaults overlaid with the entity's own values.
 * Works for nodes (component type) and edges (connection type).
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ props: Record<string, unknown> }} entity
 * @returns {Record<string, any>}
 */
export function effectiveProps (registry, entity) {
  const manifest = describedBy(registry, entity)
  return { ...defaultProps(manifest?.properties), ...entity.props }
}

/**
 * Every property value with where it came from: 'default' (manifest) or 'override' (entity).
 * Roll-up values for composites are added by the roll-up engine.
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ props: Record<string, unknown> }} entity  a node or an edge
 */
export function explainProps (registry, entity) {
  const manifest = describedBy(registry, entity)
  /** @type {Record<string, {value: unknown, source: 'default'|'override', unit?: string, group?: string}>} */
  const out = {}
  for (const [key, schema] of Object.entries(manifest?.properties ?? {})) {
    if (schema.default !== undefined) out[key] = { value: schema.default, source: 'default', unit: schema.unit, group: schema.group }
  }
  for (const [key, value] of Object.entries(entity.props ?? {})) {
    const schema = manifest?.properties?.[key]
    out[key] = { value, source: 'override', unit: schema?.unit, group: schema?.group }
  }
  return out
}

/**
 * Follows a port through boundary ports down to the atomic port that handles it.
 * A composite node's port mirrors a boundary port of its system, which maps to an internal
 * port, which may itself be a composite's port, and so on.
 * @param {Source} src
 * @param {string} portId
 * @returns {{ port: any, chain: string[], boundaryPortIds: string[], unmapped: boolean }}
 */
export function resolvePort (src, portId) {
  let port = src.require('port', portId)
  const chain = [port.id]
  const boundaryPortIds = []
  for (let hops = 0; port.boundaryPortId; hops++) {
    if (hops > MAX_PORT_HOPS) fail('CYCLE', `Port '${portId}' resolves through more than ${MAX_PORT_HOPS} boundary ports`)
    const bp = src.get('boundaryPort', port.boundaryPortId)
    if (!bp) return { port, chain, boundaryPortIds, unmapped: true }
    boundaryPortIds.push(bp.id)
    if (!bp.internalPortId) return { port, chain, boundaryPortIds, unmapped: true }
    const next = src.get('port', bp.internalPortId)
    if (!next) return { port, chain, boundaryPortIds, unmapped: true }
    port = next
    chain.push(port.id)
  }
  return { port, chain, boundaryPortIds, unmapped: false }
}

/**
 * A port with its connection types resolved: a composite's port accepts what the internal
 * port behind its boundary port accepts. An empty list means any type.
 * @param {Source} src
 * @param {any} port
 */
export function acceptsOf (src, port) {
  if (!port.boundaryPortId) return port.accepts ?? []
  const { port: target, unmapped } = resolvePort(src, port.id)
  return unmapped ? [] : (target.accepts ?? [])
}

/**
 * The next C4 level below a system's level, used when extracting a child system.
 * @param {string|null} levelTag
 */
export function childLevel (levelTag) {
  if (levelTag === 'context') return 'container'
  if (levelTag === 'container') return 'component'
  return null
}
