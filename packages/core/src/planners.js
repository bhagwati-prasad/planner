/**
 * Pure planners for the compound recursion operations (eng §7, ADR 0012). Each reads the model
 * and returns the primitive commands that carry the operation out, in an order where every
 * command is valid on its own; `system.extract` and `system.inline` run them as one operation,
 * so one undo step. Planning changes nothing: ids for new entities come from `newId`.
 */
import { fail } from './errors.js'
import {
  boundaryPortsOf,
  childLevel,
  edgesAtPort,
  edgesOf,
  exposedMethods,
  nodesOf,
  portsOf,
  viewsOf,
} from './model.js'
import {
  centroid,
  offsetEntry,
  optionalString,
  requireString,
  stringList,
  uniqueName,
} from './commands/ops.js'

/**
 * @typedef {import('./model.js').Source} Source
 * @typedef {import('./registry.js').Registry|undefined} Registry
 * @typedef {{ type: string, payload: Record<string, any> }} Command
 * @typedef {{ nodeId: string, method: string }} Target
 */

/**
 * Plans extracting components into a new System (spec §7). The System gets a boundary port for
 * every port that traffic crosses, and binds the methods called across the entering edges: the
 * edge's method, or every method the port exposes when the edge names none (ADR 0011). Bindings
 * of the enclosing system that targeted a moved component go through the new System instead.
 * @param {Source} src
 * @param {Registry} registry
 * @param {{ systemId: string, nodeIds: string[], name?: string, id?: string, nodeId?: string }} payload
 * @param {() => string} newId
 * @returns {{ commands: Command[], systemId: string, nodeId: string, name: string }}
 */
export function planExtract(src, registry, payload, newId) {
  const parent = src.require('system', requireString(payload.systemId, 'systemId'))
  const nodeIds = stringList(payload.nodeIds, 'nodeIds') ?? []
  if (nodeIds.length === 0) fail('INVALID', 'Select at least one node to extract')
  const selected = new Set(nodeIds)
  if (selected.size !== nodeIds.length) fail('INVALID', 'nodeIds contains duplicates')
  const nodes = [...selected].sort().map(id => src.require('node', id))
  for (const node of nodes)
    if (node.systemId !== parent.id)
      fail('INVALID', `'${node.name}' is not in system '${parent.name}'`)

  const remaining = nodesOf(src, parent.id)
    .filter(n => !selected.has(n.id))
    .map(n => n.name)
  const name =
    payload.name !== undefined
      ? requireString(payload.name, 'name').trim()
      : uniqueName(remaining, 'New system')
  const systemId = optionalString(payload.id, 'id') ?? newId()
  const nodeId = optionalString(payload.nodeId, 'nodeId') ?? newId()
  const viewId = newId()

  const movedPorts = new Set(nodes.flatMap(n => portsOf(src, n.id).map(port => port.id)))
  const internal = []
  const incoming = []
  const outgoing = []
  for (const edge of edgesOf(src, parent.id)) {
    const fromInside = movedPorts.has(edge.fromPort)
    const toInside = movedPorts.has(edge.toPort)
    if (fromInside && toInside) internal.push(edge)
    else if (toInside) incoming.push(edge)
    else if (fromInside) outgoing.push(edge)
  }
  const parentBps = boundaryPortsOf(src, parent.id).filter(
    bp => bp.internalPortId && movedPorts.has(bp.internalPortId)
  )

  // One boundary port per (internal port, direction) that traffic crosses, plus one for every
  // boundary port of the parent that pointed into the selection.
  /** @type {Map<string, { id: string, mirror: string, name: string, direction: string, portId: string, bindings: Record<string, Target> }>} */
  const bps = new Map()
  const bpNames = new Set()
  const need = (/** @type {string} */ portId, /** @type {string} */ direction) => {
    const key = `${portId}|${direction}`
    if (!bps.has(key)) {
      const port = src.require('port', portId)
      const owner = src.require('node', port.nodeId)
      const bpName = bpNames.has(port.name)
        ? uniqueName(bpNames, `${owner.name}.${port.name}`)
        : port.name
      bpNames.add(bpName)
      bps.set(key, { id: newId(), mirror: newId(), name: bpName, direction, portId, bindings: {} })
    }
    return /** @type {NonNullable<ReturnType<typeof bps.get>>} */ (bps.get(key))
  }
  const entering = incoming.map(edge => need(edge.toPort, 'in'))
  const leaving = outgoing.map(edge => need(edge.fromPort, 'out'))
  const mapped = parentBps.map(bp => need(bp.internalPortId, bp.direction))

  // The methods called across the entering edges.
  incoming.forEach((edge, i) => {
    const port = src.require('port', edge.toPort)
    for (const method of edge.method ? [edge.method] : exposedMethods(src, registry, port))
      entering[i].bindings[method] = { nodeId: port.nodeId, method }
  })

  // Bindings of the parent's boundary ports that target a moved component now go through a
  // boundary port of the System from which that component is reached inside.
  const inside = reachInside(src, nodes, internal)
  const into = [...new Map(mapped.map(bp => [bp.id, bp])).values()]
  const candidates = [...into, ...entering.filter(bp => !into.includes(bp))]
  /** @type {{ boundaryPortId: string, method: string, target: string }[]} */
  const rebinds = []
  for (const outer of boundaryPortsOf(src, parent.id))
    for (const [method, target] of Object.entries(outer.bindings ?? {})) {
      if (!selected.has(target.nodeId)) continue
      const via = candidates.find(bp =>
        inside.get(src.require('port', bp.portId).nodeId)?.has(target.nodeId)
      )
      if (!via) continue
      const same = Object.entries(via.bindings).find(
        ([, t]) => t.nodeId === target.nodeId && t.method === target.method
      )
      const as = same ? same[0] : uniqueName(Object.keys(via.bindings), target.method)
      via.bindings[as] = { nodeId: target.nodeId, method: target.method }
      rebinds.push({ boundaryPortId: outer.id, method, target: as })
    }

  /** @type {Command[]} */
  const commands = []
  const levelTag = childLevel(parent.levelTag)
  commands.push({
    type: 'system.create',
    payload: { id: systemId, viewId, name, ...(levelTag ? { levelTag } : {}) },
  })
  for (const bp of bps.values())
    commands.push({
      type: 'boundary.add',
      payload: { systemId, id: bp.id, name: bp.name, direction: bp.direction },
    })
  const statuses = new Set(nodes.map(n => n.status))
  commands.push({
    type: 'node.own',
    payload: {
      systemId: parent.id,
      innerSystemRef: systemId,
      id: nodeId,
      name,
      status: statuses.size === 1 ? nodes[0].status : 'planned',
      ports: Object.fromEntries([...bps.values()].map(bp => [bp.id, bp.mirror])),
    },
  })
  incoming.forEach((edge, i) =>
    commands.push({ type: 'edge.rewire', payload: { id: edge.id, toPort: entering[i].mirror } })
  )
  outgoing.forEach((edge, i) =>
    commands.push({ type: 'edge.rewire', payload: { id: edge.id, fromPort: leaving[i].mirror } })
  )
  parentBps.forEach((bp, i) =>
    commands.push({
      type: 'boundary.update',
      payload: { id: bp.id, changes: { internalPortId: mapped[i].mirror } },
    })
  )
  commands.push({ type: 'node.move', payload: { ids: nodes.map(n => n.id), systemId } })
  for (const bp of bps.values()) {
    commands.push({
      type: 'boundary.update',
      payload: { id: bp.id, changes: { internalPortId: bp.portId } },
    })
    for (const [method, target] of Object.entries(bp.bindings))
      commands.push({
        type: 'boundary.bind',
        payload: { boundaryPortId: bp.id, method, nodeId: target.nodeId, target: target.method },
      })
  }
  for (const { boundaryPortId, method, target } of rebinds)
    commands.push({
      type: 'boundary.bind',
      payload: { boundaryPortId, method, nodeId, target },
    })

  // Views: the System's view takes the positions from the parent's primary view; each parent
  // view shows the System where the selection was, and crossing edges lose their waypoints.
  const moved = [...nodes.map(n => n.id), ...internal.map(e => e.id)]
  const parentViews = viewsOf(src, parent.id)
  if (parentViews.length) {
    const inherited = pick(parentViews[0].layout, moved)
    if (Object.keys(inherited).length)
      commands.push({ type: 'view.layout', payload: { viewId, set: inherited } })
  }
  const crossing = [...incoming, ...outgoing].map(e => e.id)
  for (const view of parentViews) {
    for (const id of crossing) {
      const entry = view.layout[id]
      if (!entry?.waypoints) continue
      const { waypoints: _dropped, ...rest } = entry
      commands.push({ type: 'view.layout', payload: { viewId: view.id, unset: [id] } })
      if (Object.keys(rest).length)
        commands.push({ type: 'view.layout', payload: { viewId: view.id, set: { [id]: rest } } })
    }
    const center = centroid(
      view.layout,
      nodes.map(n => n.id)
    )
    if (center)
      commands.push({
        type: 'view.layout',
        payload: { viewId: view.id, set: { [nodeId]: { x: center.x, y: center.y } } },
      })
  }
  return { commands, systemId, nodeId, name }
}

/**
 * Plans inlining a System placed by value (spec §7): its components and edges move up into the
 * parent, edges through its ports reconnect to the ports inside, and bindings of the parent
 * that went through it go straight to their targets. A composite placed by reference is
 * detached first (`system.inline` does that).
 * @param {Source} src
 * @param {Registry} _registry
 * @param {{ nodeId: string }} payload
 * @returns {{ commands: Command[], nodeIds: string[] }}
 */
export function planInline(src, _registry, payload) {
  const composite = src.require('node', requireString(payload.nodeId, 'nodeId'))
  if (!composite.innerSystemRef)
    fail('INVALID', `'${composite.name}' has no inner system to inline`)
  if (composite.placement !== 'value')
    fail('INVALID', `'${composite.name}' is placed by reference; detach it before inlining`)
  const parentId = composite.systemId
  const childId = composite.innerSystemRef
  const childNodes = nodesOf(src, childId)
  const childEdges = edgesOf(src, childId)
  const childBps = boundaryPortsOf(src, childId)
  const nodeIds = childNodes.map(n => n.id)

  /** @type {Command[]} */
  const commands = []
  for (const bp of childBps)
    if (bp.internalPortId)
      commands.push({
        type: 'boundary.update',
        payload: { id: bp.id, changes: { internalPortId: null } },
      })
  if (nodeIds.length)
    commands.push({ type: 'node.move', payload: { ids: nodeIds, systemId: parentId } })

  for (const mirror of portsOf(src, composite.id)) {
    const bp = mirror.boundaryPortId ? src.get('boundaryPort', mirror.boundaryPortId) : null
    const target = bp?.internalPortId ?? null
    for (const edge of edgesAtPort(src, mirror.id)) {
      if (!target) commands.push({ type: 'edge.remove', payload: { id: edge.id } })
      else
        commands.push({
          type: 'edge.rewire',
          payload:
            edge.fromPort === mirror.id
              ? { id: edge.id, fromPort: target }
              : { id: edge.id, toPort: target },
        })
    }
    for (const outer of src.find('boundaryPort', 'internalPortId', mirror.id))
      commands.push({
        type: 'boundary.update',
        payload: { id: outer.id, changes: { internalPortId: target } },
      })
  }

  // Bindings that went through the System go straight to what it had bound them to.
  for (const outer of boundaryPortsOf(src, parentId))
    for (const [method, target] of Object.entries(outer.bindings ?? {})) {
      if (target.nodeId !== composite.id) continue
      const inner = childBps.map(bp => bp.bindings?.[target.method]).find(Boolean)
      commands.push(
        inner
          ? {
              type: 'boundary.bind',
              payload: {
                boundaryPortId: outer.id,
                method,
                nodeId: inner.nodeId,
                target: inner.method,
              },
            }
          : { type: 'boundary.unbind', payload: { boundaryPortId: outer.id, method } }
      )
    }

  // Views: each parent view shows the components where the System was.
  const source = viewsOf(src, childId)[0]?.layout ?? {}
  const origin = centroid(source, nodeIds) ?? { x: 0, y: 0 }
  for (const view of viewsOf(src, parentId)) {
    const at = view.layout[composite.id]
    if (at && typeof at.x === 'number' && typeof at.y === 'number') {
      const set = {}
      for (const id of [...nodeIds, ...childEdges.map(e => e.id)])
        if (source[id]) set[id] = offsetEntry(source[id], at.x - origin.x, at.y - origin.y)
      if (Object.keys(set).length)
        commands.push({ type: 'view.layout', payload: { viewId: view.id, set } })
    }
    if (view.hidden.includes(composite.id) && nodeIds.length)
      commands.push({ type: 'view.hide', payload: { viewId: view.id, ids: nodeIds } })
  }

  commands.push({ type: 'node.remove', payload: { id: composite.id } })
  return { commands, nodeIds }
}

/**
 * For each selected component, the selected components it reaches along the edges among them.
 * @param {Source} src
 * @param {{ id: string }[]} nodes
 * @param {{ fromPort: string, toPort: string }[]} internal
 */
function reachInside(src, nodes, internal) {
  const links = internal.map(edge => ({
    from: src.require('port', edge.fromPort),
    to: src.require('port', edge.toPort),
  }))
  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  for (const node of nodes) {
    const seen = new Set()
    const queue = [node.id]
    while (queue.length) {
      const id = /** @type {string} */ (queue.shift())
      if (seen.has(id)) continue
      seen.add(id)
      for (const { from, to } of links) {
        if (from.nodeId === id) queue.push(to.nodeId)
        else if (to.nodeId === id && from.direction === 'both' && to.direction === 'both')
          queue.push(from.nodeId)
      }
    }
    out.set(node.id, seen)
  }
  return out
}

/** @param {Record<string, any>} layout @param {string[]} ids */
function pick(layout, ids) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const id of ids) if (layout[id]) out[id] = layout[id]
  return out
}
