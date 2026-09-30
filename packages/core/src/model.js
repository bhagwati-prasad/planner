/**
 * Read helpers over the model. Each takes a source with `get`, `require`, `all` and `find`
 * (a Store, or a Tx while a command runs), so handlers and queries share one implementation.
 */
import { fail } from './errors.js'
import { SYSTEM_TYPE_REF } from './builtins.js'
import { defaultProps } from './props.js'
import { inputValue } from './schema.js'

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
export function projectOf(src) {
  return src.all('project')[0] ?? null
}

/** @param {Source} src */
export function requireProject(src) {
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
/**
 * 'composite' when a node has an inner system, 'atomic' when it has none (ADR 0009: the model
 * stores only `innerSystemRef`).
 * @param {{ innerSystemRef?: string|null }} node
 * @returns {'atomic'|'composite'}
 */
export const nodeKind = node => (node.innerSystemRef ? 'composite' : 'atomic')

/** Composite nodes that place `systemId`. @param {Source} src @param {string} systemId */
export const referencingNodes = (src, systemId) => src.find('node', 'innerSystemRef', systemId)

/** Edges attached to a port, in id order. @param {Source} src @param {string} portId */
export function edgesAtPort(src, portId) {
  const seen = new Map()
  for (const e of src.find('edge', 'fromPort', portId)) seen.set(e.id, e)
  for (const e of src.find('edge', 'toPort', portId)) seen.set(e.id, e)
  return [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** @param {Source} src @param {string} nodeId @param {string} name */
export function portByName(src, nodeId, name) {
  return portsOf(src, nodeId).find(p => p.name === name) ?? null
}

/** @param {Source} src @param {string} portId */
export function nodeOfPort(src, portId) {
  return src.require('node', src.require('port', portId).nodeId)
}

/** The system a port's node lives in. @param {Source} src @param {string} portId */
export function systemOfPort(src, portId) {
  return nodeOfPort(src, portId).systemId
}

/** Systems placed directly inside `systemId`, in node order. @param {Source} src @param {string} systemId */
export function childSystemIds(src, systemId) {
  return nodesOf(src, systemId)
    .filter(n => n.innerSystemRef)
    .map(n => n.innerSystemRef)
}

/** The resolver's defensive depth limit (eng §9); the UI warns from depth 8. */
export const MAX_SYSTEM_DEPTH = 64

/**
 * The system reached by going down through composite nodes from the root, and whether it is
 * read-only there: everything inside a system placed by reference is, at every depth, because
 * it is edited at its source (eng §9).
 * @param {Source} src
 * @param {string[]} path  composite node ids, each inside the system the one before it opens
 * @returns {{ systemId: string, depth: number, readOnly: boolean, path: string[] }}
 */
export function resolveSystem(src, path) {
  if (path.length > MAX_SYSTEM_DEPTH)
    fail(
      'E_SYSTEM_TOO_DEEP',
      `A path of ${path.length} levels is deeper than the limit of ${MAX_SYSTEM_DEPTH}`,
      { depth: path.length }
    )
  let systemId = requireProject(src).rootSystemId
  let readOnly = false
  for (const nodeId of path) {
    const node = src.get('node', nodeId)
    if (!node || node.systemId !== systemId || !node.innerSystemRef)
      fail('E_SYSTEM_PATH', `'${nodeId}' is not a composite node in system '${systemId}'`, {
        nodeId,
        systemId,
      })
    readOnly ||= node.placement === 'reference'
    systemId = node.innerSystemRef
  }
  return { systemId, depth: path.length, readOnly, path: [...path] }
}

/**
 * Visits every component of `systemId` and, through composites, of every system below it,
 * depth-first in node order. A system placed by reference in several places is walked once, so
 * each component is visited once. Depth 0 is `systemId` itself; `maxDepth` stops the descent,
 * and a model deeper than MAX_SYSTEM_DEPTH fails with E_SYSTEM_TOO_DEEP.
 * @param {Source} src
 * @param {string} systemId
 * @param {(node: any, where: { depth: number, systemId: string }) => void} visit
 * @param {{ maxDepth?: number }} [options]
 */
export function walk(src, systemId, visit, { maxDepth = Infinity } = {}) {
  const seen = new Set()
  /** @param {string} id @param {number} depth */
  const go = (id, depth) => {
    if (seen.has(id)) return
    seen.add(id)
    for (const node of nodesOf(src, id)) {
      visit(node, { depth, systemId: id })
      if (!node.innerSystemRef || depth >= maxDepth) continue
      if (depth + 1 > MAX_SYSTEM_DEPTH)
        fail(
          'E_SYSTEM_TOO_DEEP',
          `System '${node.innerSystemRef}' is more than ${MAX_SYSTEM_DEPTH} levels deep`,
          { systemId: node.innerSystemRef, depth: depth + 1 }
        )
      go(node.innerSystemRef, depth + 1)
    }
  }
  go(systemId, 0)
}

/**
 * True when `outer` contains `inner` at any depth (not counting outer === inner).
 * @param {Source} src
 * @param {string} outer
 * @param {string} inner
 */
export function containsSystem(src, outer, inner) {
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
export function wouldCycle(src, containerId, childId) {
  return containerId === childId || containsSystem(src, childId, containerId)
}

/**
 * `systemId` and every system below it, depth-first, each once.
 * @param {Source} src
 * @param {string} systemId
 */
export function subtreeSystemIds(src, systemId) {
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
export function pathsTo(src, systemId, { limit = 100 } = {}) {
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
      walk(
        node.systemId,
        [{ systemId: id, viaNodeId: node.id }, ...suffix],
        new Set([...seen, node.systemId])
      )
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
export function isLibrarySystem(src, system) {
  return !system.ownerNodeId && system.id !== projectOf(src)?.rootSystemId
}

/**
 * The resolved component manifest of a node, or null: a System, whose values come from its
 * inner system, or a placeholder. A component opened as a system keeps its own manifest (its
 * black-box model, spec §7).
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ typeRef: string|null, innerSystemRef?: string|null }} node
 */
export function manifestOf(registry, node) {
  if (!node.typeRef || node.typeRef === SYSTEM_TYPE_REF || !registry) return null
  return registry.resolve(node.typeRef)
}

/**
 * The public methods a port exposes (spec §6): those its component's manifest lists for it, or,
 * on a System component, the methods bound on the boundary port it mirrors (ADR 0010).
 * @param {Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ nodeId: string, name: string, boundaryPortId?: string|null }} port
 * @returns {string[]}
 */
export function exposedMethods(src, registry, port) {
  const node = src.require('node', port.nodeId)
  if (node.typeRef === SYSTEM_TYPE_REF) {
    const bp = port.boundaryPortId ? src.get('boundaryPort', port.boundaryPortId) : null
    return bp ? Object.keys(bp.bindings ?? {}) : []
  }
  const spec = manifestOf(registry, node)?.ports?.find(p => p.name === port.name)
  return spec?.exposes ?? []
}

/**
 * The names of a component's public methods: from its manifest, or, for a System component,
 * the methods bound on its boundary ports (ADR 0010).
 * @param {Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ typeRef: string|null, innerSystemRef?: string|null }} node
 * @returns {string[]}
 */
export function publicMethods(src, registry, node) {
  if (node.typeRef === SYSTEM_TYPE_REF && node.innerSystemRef) {
    const bound = boundaryPortsOf(src, node.innerSystemRef).flatMap(bp =>
      Object.keys(bp.bindings ?? {})
    )
    return [...new Set(bound)]
  }
  return Object.keys(manifestOf(registry, node)?.methods?.public ?? {})
}

/**
 * The components a boundary port reaches (ADR 0010): the one that owns its internal port, and
 * every component reached from there along edges in their direction, or back along an edge
 * whose two ports both go both ways.
 * @param {Source} src
 * @param {{ systemId: string, internalPortId: string|null }} bp
 * @returns {Set<string>}
 */
export function reachableFrom(src, bp) {
  const seen = new Set()
  const start = bp.internalPortId ? src.get('port', bp.internalPortId) : null
  if (!start) return seen
  const links = edgesOf(src, bp.systemId).map(edge => ({
    from: src.get('port', edge.fromPort),
    to: src.get('port', edge.toPort),
  }))
  const queue = [start.nodeId]
  while (queue.length) {
    const id = /** @type {string} */ (queue.shift())
    if (seen.has(id)) continue
    seen.add(id)
    for (const { from, to } of links) {
      if (!from || !to) continue
      if (from.nodeId === id) queue.push(to.nodeId)
      else if (to.nodeId === id && from.direction === 'both' && to.direction === 'both')
        queue.push(from.nodeId)
    }
  }
  return seen
}

/**
 * Follows a public method's bindings down through every level to the component that
 * implements it (spec §7, eng §9). A component without an inner system implements its own.
 * With `levels`, it stops that many hops down, so a run can expand one composite at a time.
 * @param {Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {string} nodeId
 * @param {string} method
 * @param {{ port?: string, levels?: number }} [options]  `port` names the exposing port, when
 *   there are several
 * @returns {{ nodeId: string, method: string, path: { nodeId: string, method: string }[] }}
 */
export function resolveBinding(src, registry, nodeId, method, { port, levels = Infinity } = {}) {
  const path = []
  let node = src.require('node', nodeId)
  let name = method
  let portName = port
  for (;;) {
    path.push({ nodeId: node.id, method: name })
    if (!node.innerSystemRef || path.length > levels) return { nodeId: node.id, method: name, path }
    if (path.length > MAX_SYSTEM_DEPTH)
      fail('E_SYSTEM_TOO_DEEP', `Bindings of '${method}' go deeper than ${MAX_SYSTEM_DEPTH} levels`)
    const ports = portsOf(src, node.id).filter(
      p =>
        (portName === undefined || p.name === portName) &&
        exposedMethods(src, registry, p).includes(name)
    )
    if (!ports.length) {
      const known = publicMethods(src, registry, node).includes(name)
      fail(
        known ? 'E_METHOD_NOT_EXPOSED' : 'E_METHOD_UNKNOWN',
        known
          ? `No port of '${node.name}' exposes '${name}'${portName ? ` as '${portName}'` : ''}`
          : `'${node.name}' has no public method '${name}'`,
        { nodeId: node.id, method: name }
      )
    }
    const binding = ports
      .map(p => (p.boundaryPortId ? src.get('boundaryPort', p.boundaryPortId) : null))
      .map(bp => bp?.bindings?.[name])
      .find(Boolean)
    if (!binding)
      fail(
        'E_METHOD_UNBOUND',
        `Public method '${name}' of '${node.name}' is not bound to a component inside`,
        { nodeId: node.id, method: name }
      )
    node = src.require('node', binding.nodeId)
    name = binding.method
    portName = undefined
  }
}

/**
 * The connection type of an edge, with inheritance applied, or null when the edge has none or
 * it is not installed. Connection types resolve by id (latest version).
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ connectionType: string|null }} edge
 */
export function connectionTypeOf(registry, edge) {
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
function describedBy(registry, entity) {
  return 'fromPort' in entity ? connectionTypeOf(registry, entity) : manifestOf(registry, entity)
}

/**
 * Property values after defaults: manifest defaults overlaid with the entity's own values.
 * Works for nodes (component type) and edges (connection type).
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ props: Record<string, unknown> }} entity
 * @returns {Record<string, any>}
 */
export function effectiveProps(registry, entity) {
  const manifest = describedBy(registry, entity)
  return { ...defaultProps(manifest?.properties), ...entity.props }
}

/**
 * Every property value with where it came from: 'default' (manifest) or 'override' (entity),
 * and `input`, the value as a person writes it (see schema.js inputValue). Roll-up values for
 * composites are added by the roll-up engine.
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ props: Record<string, unknown> }} entity  a node or an edge
 */
export function explainProps(registry, entity) {
  const manifest = describedBy(registry, entity)
  /** @type {Record<string, {value: unknown, input: unknown, source: 'default'|'override', unit?: string, group?: string}>} */
  const out = {}
  for (const [key, schema] of Object.entries(manifest?.properties ?? {})) {
    if (schema.default !== undefined)
      out[key] = {
        value: schema.default,
        input: inputValue(schema, schema.default),
        source: 'default',
        unit: schema.unit,
        group: schema.group,
      }
  }
  for (const [key, value] of Object.entries(entity.props ?? {})) {
    const schema = manifest?.properties?.[key]
    out[key] = {
      value,
      input: inputValue(schema, value),
      source: 'override',
      unit: schema?.unit,
      group: schema?.group,
    }
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
export function resolvePort(src, portId) {
  let port = src.require('port', portId)
  const chain = [port.id]
  const boundaryPortIds = []
  for (let hops = 0; port.boundaryPortId; hops++) {
    if (hops > MAX_PORT_HOPS)
      fail('CYCLE', `Port '${portId}' resolves through more than ${MAX_PORT_HOPS} boundary ports`)
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
export function acceptsOf(src, port) {
  if (!port.boundaryPortId) return port.accepts ?? []
  const { port: target, unmapped } = resolvePort(src, port.id)
  return unmapped ? [] : (target.accepts ?? [])
}

/**
 * The next C4 level below a system's level, used when extracting a child system.
 * @param {string|null} levelTag
 */
export function childLevel(levelTag) {
  if (levelTag === 'context') return 'container'
  if (levelTag === 'container') return 'component'
  return null
}
