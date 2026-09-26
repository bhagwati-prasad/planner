/**
 * Building blocks shared by command handlers. Every function takes the handler context and
 * mutates only through `ctx.tx`, allocating ids only through `ctx.newId()` and iterating in id
 * order, so the same command on the same model always produces the same result (replay).
 */
import { didYouMean, fail, suggest } from '../errors.js'
import { validateValue } from '../props.js'
import { isPlainObject } from '../plain.js'
import { PORT_DIRECTIONS } from '../registry.js'
import {
  acceptsOf,
  boundaryPortsOf,
  edgesAtPort,
  edgesOf,
  nodesOf,
  portsOf,
  viewsOf,
} from '../model.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

export const DEFAULT_LAYER = Object.freeze({
  id: 'default',
  name: 'Default',
  locked: false,
  hidden: false,
})

// ---------------------------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------------------------

/** @param {unknown} value @param {string} label */
export function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim())
    fail('INVALID', `${label} must be a non-empty string`)
  return /** @type {string} */ (value)
}

/** @param {unknown} value @param {string} label @returns {string|undefined} */
export function optionalString(value, label) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') fail('INVALID', `${label} must be a string`)
  return value
}

/** @param {unknown} value @param {string} label @returns {string|null|undefined} */
export function nullableString(value, label) {
  if (value === undefined || value === null) return /** @type {null|undefined} */ (value)
  if (typeof value !== 'string') fail('INVALID', `${label} must be a string or null`)
  return value
}

/** @param {unknown} value @param {string} label */
export function stringList(value, label) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string'))
    fail('INVALID', `${label} must be a list of strings`)
  return /** @type {string[]} */ (value)
}

/**
 * @template T
 * @param {unknown} value
 * @param {readonly T[]} options
 * @param {string} label
 * @returns {T|undefined}
 */
export function oneOf(value, options, label) {
  if (value === undefined) return undefined
  if (!options.includes(/** @type {T} */ (value)))
    fail('INVALID', `${label} must be one of ${options.map(o => JSON.stringify(o)).join(', ')}`)
  return /** @type {T} */ (value)
}

/** @param {unknown} value @param {string} label */
export function plainObject(value, label) {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) fail('INVALID', `${label} must be an object`)
  return /** @type {Record<string, any>} */ (value)
}

/**
 * Rejects keys outside `allowed`.
 * @param {Record<string, unknown>} obj
 * @param {string[]} allowed
 * @param {string} label
 */
export function onlyKeys(obj, allowed, label) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key))
      fail('INVALID', `${label}: '${key}' cannot be changed here (allowed: ${allowed.join(', ')})`)
  }
}

/**
 * `base`, or `base 2`, `base 3`, ... whichever is not in `taken`.
 * @param {Iterable<string>} taken
 * @param {string} base
 */
export function uniqueName(taken, base) {
  const names = new Set(taken)
  if (!names.has(base)) return base
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`
}

// ---------------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------------

/**
 * Creates a system and, unless disabled, its default logical view.
 * @param {Ctx} ctx
 * @param {{ id?: string, name: string, levelTag?: string|null, description?: string, ownerNodeId?: string|null, contract?: object, rollups?: object, tags?: string[] }} fields
 * @param {{ defaultView?: boolean }} [options]
 */
export function createSystem(ctx, fields, { defaultView = true } = {}) {
  const id = fields.id ?? ctx.newId()
  ctx.tx.create('system', {
    id,
    name: fields.name,
    description: fields.description ?? '',
    levelTag: fields.levelTag ?? null,
    contract: fields.contract ?? {},
    rollups: fields.rollups ?? {},
    tags: fields.tags ?? [],
    ownerNodeId: fields.ownerNodeId ?? null,
  })
  if (defaultView) createView(ctx, id, { name: 'Logical', kind: 'logical' })
  return id
}

/**
 * @param {Ctx} ctx
 * @param {string} systemId
 * @param {{ id?: string, name: string, kind?: string, layout?: object, hidden?: string[], layers?: object[], filters?: object, styles?: object }} fields
 */
export function createView(ctx, systemId, fields) {
  const id = fields.id ?? ctx.newId()
  ctx.tx.create('view', {
    id,
    systemId,
    name: fields.name,
    kind: fields.kind ?? 'logical',
    layout: fields.layout ?? {},
    hidden: fields.hidden ?? [],
    layers: fields.layers ?? [DEFAULT_LAYER],
    filters: fields.filters ?? {},
    styles: fields.styles ?? {},
  })
  return id
}

/**
 * Gives a composite node one port per boundary port of the system it places.
 * @param {Ctx} ctx
 * @param {string} nodeId
 * @param {string} systemId
 */
export function createMirrorPorts(ctx, nodeId, systemId) {
  for (const bp of boundaryPortsOf(ctx.tx, systemId)) createMirrorPort(ctx, nodeId, bp)
}

/** @param {Ctx} ctx @param {string} nodeId @param {any} bp */
export function createMirrorPort(ctx, nodeId, bp) {
  const id = ctx.newId()
  ctx.tx.create('port', {
    id,
    nodeId,
    name: bp.name,
    direction: bp.direction,
    accepts: null,
    declared: true,
    boundaryPortId: bp.id,
  })
  return id
}

// ---------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------

/**
 * Checks property values against a manifest (a component or connection type). Without a
 * manifest (not installed) values are kept unchecked.
 * @param {import('../registry.js').EffectiveManifest|null} manifest
 * @param {Record<string, unknown>} props
 * @param {string} label
 */
export function validateProps(manifest, props, label) {
  if (!manifest) return
  const known = Object.keys(manifest.properties)
  for (const [key, value] of Object.entries(props)) {
    const schema = manifest.properties[key]
    if (!schema)
      fail(
        'INVALID',
        `Unknown property '${key}' for ${label} (${manifest.typeRef}).${didYouMean(suggest(key, known))}`
      )
    validateValue(schema, value, `${label}.${key}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------------------------

/**
 * The port an edge names, or E_PORT_NOT_FOUND.
 * @param {any} src
 * @param {string} id
 */
function requirePort(src, id) {
  if (!src.has('port', id)) fail('E_PORT_NOT_FOUND', `Port '${id}' not found`, { portId: id })
  return src.get('port', id)
}

/**
 * Validates an edge between two ports and picks its connection type.
 * @param {import('../model.js').Source} src
 * @param {string} fromPortId
 * @param {string} toPortId
 * @param {string|null|undefined} connectionType
 */
export function checkConnection(src, fromPortId, toPortId, connectionType) {
  const from = requirePort(src, fromPortId)
  const to = requirePort(src, toPortId)
  if (from.id === to.id) fail('INVALID', 'An edge cannot connect a port to itself')
  const fromNode = src.require('node', from.nodeId)
  const toNode = src.require('node', to.nodeId)
  if (fromNode.systemId !== toNode.systemId) {
    fail(
      'INVALID',
      `'${fromNode.name}' and '${toNode.name}' are in different systems; connect through boundary ports instead`
    )
  }
  if (from.direction === 'in')
    fail('INVALID', `Port '${fromNode.name}.${from.name}' is an input and cannot start an edge`)
  if (to.direction === 'out')
    fail('INVALID', `Port '${toNode.name}.${to.name}' is an output and cannot end an edge`)
  const fromAccepts = acceptsOf(src, from)
  const toAccepts = acceptsOf(src, to)
  let type = connectionType ?? null
  if (type === null) {
    if (fromAccepts.length && toAccepts.length)
      type = fromAccepts.find(t => toAccepts.includes(t)) ?? null
    else type = fromAccepts[0] ?? toAccepts[0] ?? null
    if (type === null && fromAccepts.length && toAccepts.length) {
      fail(
        'INVALID',
        `'${fromNode.name}.${from.name}' (${fromAccepts.join(', ')}) and '${toNode.name}.${to.name}' (${toAccepts.join(', ')}) share no connection type`
      )
    }
  } else {
    requireString(type, 'connectionType')
    if (fromAccepts.length && !fromAccepts.includes(type))
      fail(
        'INVALID',
        `Port '${fromNode.name}.${from.name}' does not accept '${type}' (accepts ${fromAccepts.join(', ')})`
      )
    if (toAccepts.length && !toAccepts.includes(type))
      fail(
        'INVALID',
        `Port '${toNode.name}.${to.name}' does not accept '${type}' (accepts ${toAccepts.join(', ')})`
      )
  }
  return { from, to, fromNode, toNode, systemId: fromNode.systemId, connectionType: type }
}

/**
 * Checks that a boundary port of `systemId` in direction `direction` may map to `portId`.
 * @param {import('../model.js').Source} src
 * @param {string} systemId
 * @param {string} direction
 * @param {string} portId
 */
export function checkBoundaryMapping(src, systemId, direction, portId) {
  const port = src.require('port', portId)
  const node = src.require('node', port.nodeId)
  if (node.systemId !== systemId)
    fail('INVALID', `Port '${node.name}.${port.name}' is not inside this system`)
  const ok =
    direction === 'both'
      ? port.direction === 'both'
      : direction === 'in'
        ? port.direction !== 'out'
        : port.direction !== 'in'
  if (!ok)
    fail(
      'INVALID',
      `A '${direction}' boundary port cannot map to the '${port.direction}' port '${node.name}.${port.name}'`
    )
  return port
}

/** @param {unknown} value @param {string} label */
export function requireDirection(value, label) {
  return /** @type {'in'|'out'|'both'} */ (
    oneOf(requireString(value, label), PORT_DIRECTIONS, label)
  )
}

// ---------------------------------------------------------------------------------------------
// Removal (cascading)
// ---------------------------------------------------------------------------------------------

/**
 * Removes element ids from the layout and hidden list of every view of a system.
 * @param {Ctx} ctx
 * @param {string} systemId
 * @param {Iterable<string>} ids
 */
export function removeFromViews(ctx, systemId, ids) {
  const drop = new Set(ids)
  if (drop.size === 0) return
  for (const view of viewsOf(ctx.tx, systemId)) {
    const layoutKeys = Object.keys(view.layout)
    if (!layoutKeys.some(k => drop.has(k)) && !view.hidden.some(k => drop.has(k))) continue
    const layout = {}
    for (const key of layoutKeys) if (!drop.has(key)) layout[key] = view.layout[key]
    ctx.tx.update('view', view.id, { layout, hidden: view.hidden.filter(k => !drop.has(k)) })
  }
}

/** @param {Ctx} ctx @param {string} edgeId */
export function removeEdge(ctx, edgeId) {
  const edge = ctx.tx.require('edge', edgeId)
  removeFromViews(ctx, edge.systemId, [edgeId])
  ctx.tx.remove('edge', edgeId)
}

/**
 * Removes a port, its edges, and unmaps boundary ports that pointed at it.
 * @param {Ctx} ctx
 * @param {string} portId
 */
export function removePort(ctx, portId) {
  for (const edge of edgesAtPort(ctx.tx, portId)) removeEdge(ctx, edge.id)
  for (const bp of ctx.tx.find('boundaryPort', 'internalPortId', portId)) {
    ctx.tx.update('boundaryPort', bp.id, { internalPortId: null })
  }
  ctx.tx.remove('port', portId)
}

/**
 * Removes a node with its ports and edges, drops it from every view and, when it placed a
 * system by value, deletes that owned system and everything inside it.
 * @param {Ctx} ctx
 * @param {string} nodeId
 */
export function removeNode(ctx, nodeId) {
  const node = ctx.tx.require('node', nodeId)
  for (const port of portsOf(ctx.tx, nodeId)) removePort(ctx, port.id)
  removeFromViews(ctx, node.systemId, [nodeId])
  ctx.tx.remove('node', nodeId)
  if (
    node.kind === 'composite' &&
    node.placement === 'value' &&
    ctx.tx.has('system', node.systemRef)
  ) {
    deleteSystemDeep(ctx, node.systemRef)
  }
}

/**
 * Removes a boundary port and the matching port on every composite that places its system
 * (with the edges attached to those ports).
 * @param {Ctx} ctx
 * @param {string} bpId
 */
export function removeBoundaryPort(ctx, bpId) {
  ctx.tx.require('boundaryPort', bpId)
  for (const mirror of ctx.tx.find('port', 'boundaryPortId', bpId)) removePort(ctx, mirror.id)
  ctx.tx.remove('boundaryPort', bpId)
}

/**
 * Deletes a system and everything in it, including systems owned by its composite nodes.
 * @param {Ctx} ctx
 * @param {string} systemId
 */
export function deleteSystemDeep(ctx, systemId) {
  for (const node of nodesOf(ctx.tx, systemId)) {
    if (ctx.tx.has('node', node.id)) removeNode(ctx, node.id)
  }
  for (const bp of boundaryPortsOf(ctx.tx, systemId)) removeBoundaryPort(ctx, bp.id)
  for (const view of viewsOf(ctx.tx, systemId)) ctx.tx.remove('view', view.id)
  ctx.tx.remove('system', systemId)
}

// ---------------------------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------------------------

const ENTITY_META = ['id', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'rev']

/** Entity fields without store metadata. */
function fieldsOf(entity) {
  const out = { ...entity }
  for (const key of ENTITY_META) delete out[key]
  return out
}

/**
 * Copies the nodes, ports and edges of one system into another with fresh ids. Composites
 * placed by value get deep copies of their owned systems; composites placed by reference keep
 * pointing at the same library system. Returns a map from old ids to new ids.
 * @param {Ctx} ctx
 * @param {string} srcSystemId
 * @param {string} destSystemId
 * @param {Map<string, string>} [idMap]
 */
export function copyContents(ctx, srcSystemId, destSystemId, idMap = new Map()) {
  for (const node of nodesOf(ctx.tx, srcSystemId)) {
    const nodeId = ctx.newId()
    idMap.set(node.id, nodeId)
    let systemRef = node.systemRef
    /** @type {Map<string, string>} */
    let bpMap = new Map()
    if (node.kind === 'composite' && node.placement === 'value') {
      const clone = cloneSystem(ctx, node.systemRef, { ownerNodeId: nodeId })
      systemRef = clone.systemId
      bpMap = clone.idMap
    }
    ctx.tx.create('node', { ...fieldsOf(node), id: nodeId, systemId: destSystemId, systemRef })
    for (const port of portsOf(ctx.tx, node.id)) {
      const portId = ctx.newId()
      idMap.set(port.id, portId)
      ctx.tx.create('port', {
        ...fieldsOf(port),
        id: portId,
        nodeId,
        boundaryPortId: port.boundaryPortId
          ? (bpMap.get(port.boundaryPortId) ?? port.boundaryPortId)
          : null,
      })
    }
  }
  for (const edge of edgesOf(ctx.tx, srcSystemId)) {
    const edgeId = ctx.newId()
    idMap.set(edge.id, edgeId)
    ctx.tx.create('edge', {
      ...fieldsOf(edge),
      id: edgeId,
      systemId: destSystemId,
      fromPort: /** @type {string} */ (idMap.get(edge.fromPort)),
      toPort: /** @type {string} */ (idMap.get(edge.toPort)),
    })
  }
  return idMap
}

/**
 * Deep-copies a system (contents, boundary ports and views) as a new system.
 * @param {Ctx} ctx
 * @param {string} srcSystemId
 * @param {{ ownerNodeId?: string|null, name?: string }} [options]
 * @returns {{ systemId: string, idMap: Map<string, string> }}
 */
export function cloneSystem(ctx, srcSystemId, { ownerNodeId = null, name } = {}) {
  const src = ctx.tx.require('system', srcSystemId)
  const systemId = createSystem(
    ctx,
    { ...fieldsOf(src), name: name ?? src.name, ownerNodeId },
    { defaultView: false }
  )
  const idMap = copyContents(ctx, srcSystemId, systemId)
  for (const bp of boundaryPortsOf(ctx.tx, srcSystemId)) {
    const bpId = ctx.newId()
    idMap.set(bp.id, bpId)
    ctx.tx.create('boundaryPort', {
      ...fieldsOf(bp),
      id: bpId,
      systemId,
      internalPortId: bp.internalPortId ? (idMap.get(bp.internalPortId) ?? null) : null,
    })
  }
  for (const view of viewsOf(ctx.tx, srcSystemId)) {
    createView(ctx, systemId, {
      ...fieldsOf(view),
      layout: remapKeys(view.layout, idMap),
      hidden: view.hidden.map(id => idMap.get(id)).filter(Boolean),
    })
  }
  return { systemId, idMap }
}

/**
 * @param {Record<string, any>} layout
 * @param {Map<string, string>} idMap
 * @param {{ dx?: number, dy?: number }} [offset]
 */
export function remapKeys(layout, idMap, { dx = 0, dy = 0 } = {}) {
  const out = {}
  for (const [key, entry] of Object.entries(layout)) {
    const id = idMap.get(key)
    if (id) out[id] = offsetEntry(entry, dx, dy)
  }
  return out
}

/** @param {any} entry @param {number} dx @param {number} dy */
export function offsetEntry(entry, dx, dy) {
  if (!dx && !dy) return entry
  const out = { ...entry }
  if (typeof out.x === 'number') out.x += dx
  if (typeof out.y === 'number') out.y += dy
  if (Array.isArray(out.waypoints))
    out.waypoints = out.waypoints.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
  return out
}

/**
 * Centre of the positioned entries among `ids` in a layout, or null if none is positioned.
 * @param {Record<string, any>} layout
 * @param {Iterable<string>} ids
 */
export function centroid(layout, ids) {
  let x = 0
  let y = 0
  let n = 0
  for (const id of ids) {
    const entry = layout[id]
    if (entry && typeof entry.x === 'number' && typeof entry.y === 'number') {
      x += entry.x
      y += entry.y
      n++
    }
  }
  return n ? { x: Math.round(x / n), y: Math.round(y / n) } : null
}
