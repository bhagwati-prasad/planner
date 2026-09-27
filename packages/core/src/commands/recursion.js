/**
 * Structural roll-up (spec §6): extract a selection as a child system, and the inverse,
 * inlining a composite back into its parent. Each is one command, so one undo step.
 */
import { SYSTEM_TYPE_REF } from '../builtins.js'
import { fail } from '../errors.js'
import {
  boundaryPortsOf,
  childLevel,
  edgesAtPort,
  edgesOf,
  nodesOf,
  portsOf,
  viewsOf,
} from '../model.js'
import {
  centroid,
  copyContents,
  createMirrorPort,
  createSystem,
  offsetEntry,
  optionalString,
  removeBoundaryPort,
  removeEdge,
  requireString,
  stringList,
  uniqueName,
} from './ops.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

export const recursionCommands = {
  'system.extract': {
    description:
      'Moves the selected nodes into a new child system, creating a boundary port for every crossing edge and rewiring those edges to the new composite',
    signature: '{ systemId, nodeIds: [id], name?, id?, nodeId? }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const parent = ctx.tx.require('system', requireString(p.systemId, 'systemId'))
      const nodeIds = stringList(p.nodeIds, 'nodeIds') ?? []
      if (nodeIds.length === 0) fail('INVALID', 'Select at least one node to extract')
      const selected = new Set(nodeIds)
      if (selected.size !== nodeIds.length) fail('INVALID', 'nodeIds contains duplicates')
      const nodes = [...selected].sort().map(id => ctx.tx.require('node', id))
      for (const node of nodes) {
        if (node.systemId !== parent.id)
          fail('INVALID', `'${node.name}' is not in system '${parent.name}'`)
      }

      const remaining = nodesOf(ctx.tx, parent.id)
        .filter(n => !selected.has(n.id))
        .map(n => n.name)
      const name =
        p.name !== undefined
          ? requireString(p.name, 'name').trim()
          : uniqueName(remaining, 'New system')
      p.name = name
      const systemId = optionalString(p.id, 'id') ?? ctx.newId()
      const compositeId = optionalString(p.nodeId, 'nodeId') ?? ctx.newId()
      createSystem(ctx, {
        id: systemId,
        name,
        levelTag: childLevel(parent.levelTag),
        ownerNodeId: compositeId,
      })

      const movedPorts = new Set(nodes.flatMap(n => portsOf(ctx.tx, n.id).map(port => port.id)))
      for (const node of nodes) ctx.tx.update('node', node.id, { systemId })

      const internal = []
      const incoming = []
      const outgoing = []
      for (const edge of edgesOf(ctx.tx, parent.id)) {
        const fromInside = movedPorts.has(edge.fromPort)
        const toInside = movedPorts.has(edge.toPort)
        if (fromInside && toInside) internal.push(edge)
        else if (toInside) incoming.push(edge)
        else if (fromInside) outgoing.push(edge)
      }
      for (const edge of internal) ctx.tx.update('edge', edge.id, { systemId })

      // One boundary port per (internal port, direction) that traffic crosses, plus one for
      // every boundary port of the parent that pointed into the selection.
      const parentBps = boundaryPortsOf(ctx.tx, parent.id).filter(
        bp => bp.internalPortId && movedPorts.has(bp.internalPortId)
      )
      /** @type {Map<string, {portId: string, direction: string}>} */
      const needed = new Map()
      const need = (portId, direction) => {
        const key = `${portId}|${direction}`
        if (!needed.has(key)) needed.set(key, { portId, direction })
        return key
      }
      const incomingKeys = incoming.map(e => need(e.toPort, 'in'))
      const outgoingKeys = outgoing.map(e => need(e.fromPort, 'out'))
      const parentBpKeys = parentBps.map(bp => need(bp.internalPortId, bp.direction))

      const statuses = new Set(nodes.map(n => n.status))
      ctx.tx.create('node', {
        id: compositeId,
        systemId: parent.id,
        typeRef: SYSTEM_TYPE_REF,
        innerSystemRef: systemId,
        placement: 'value',
        name,
        description: '',
        props: {},
        tags: [],
        owner: null,
        status: statuses.size === 1 ? nodes[0].status : 'planned',
      })

      const bpNames = new Set()
      /** @type {Map<string, string>} */
      const mirrorOf = new Map()
      for (const [key, { portId, direction }] of needed) {
        const port = ctx.tx.require('port', portId)
        const owner = ctx.tx.require('node', port.nodeId)
        const bpName = bpNames.has(port.name)
          ? uniqueName(bpNames, `${owner.name}.${port.name}`)
          : port.name
        bpNames.add(bpName)
        const bp = ctx.tx.create('boundaryPort', {
          id: ctx.newId(),
          systemId,
          name: bpName,
          direction,
          internalPortId: portId,
          description: '',
        })
        mirrorOf.set(key, createMirrorPort(ctx, compositeId, bp))
      }
      incoming.forEach((edge, i) =>
        ctx.tx.update('edge', edge.id, { toPort: mirrorOf.get(incomingKeys[i]) })
      )
      outgoing.forEach((edge, i) =>
        ctx.tx.update('edge', edge.id, { fromPort: mirrorOf.get(outgoingKeys[i]) })
      )
      parentBps.forEach((bp, i) =>
        ctx.tx.update('boundaryPort', bp.id, { internalPortId: mirrorOf.get(parentBpKeys[i]) })
      )

      // Views: the child's view inherits the positions from the parent's primary view; each
      // parent view shows the new composite where the selection was.
      const moved = new Set([...nodes.map(n => n.id), ...internal.map(e => e.id)])
      const crossing = new Set([...incoming, ...outgoing].map(e => e.id))
      const parentViews = viewsOf(ctx.tx, parent.id)
      const [childView] = viewsOf(ctx.tx, systemId)
      if (parentViews.length && childView) {
        const inherited = {}
        for (const id of moved)
          if (parentViews[0].layout[id]) inherited[id] = parentViews[0].layout[id]
        ctx.tx.update('view', childView.id, { layout: inherited })
      }
      for (const view of parentViews) {
        const center = centroid(
          view.layout,
          nodes.map(n => n.id)
        )
        const layout = {}
        for (const [id, entry] of Object.entries(view.layout)) {
          if (moved.has(id)) continue
          if (crossing.has(id) && entry.waypoints) {
            const { waypoints, ...rest } = entry
            if (Object.keys(rest).length) layout[id] = rest
            continue
          }
          layout[id] = entry
        }
        if (center) layout[compositeId] = { x: center.x, y: center.y }
        ctx.tx.update('view', view.id, { layout, hidden: view.hidden.filter(id => !moved.has(id)) })
      }

      return { systemId, nodeId: compositeId }
    },
  },

  'system.inline': {
    description:
      'Dissolves a composite back into its parent and reconnects edges through its boundary ports (a by-reference composite is copied, leaving the library system untouched)',
    signature: '{ nodeId }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const composite = ctx.tx.require('node', requireString(p.nodeId, 'nodeId'))
      if (!composite.innerSystemRef)
        fail('INVALID', `'${composite.name}' has no inner system to inline`)
      const parentId = composite.systemId
      const child = ctx.tx.require('system', composite.innerSystemRef)
      const byValue = composite.placement === 'value'
      const childNodes = nodesOf(ctx.tx, child.id)
      const childEdges = edgesOf(ctx.tx, child.id)
      const childViews = viewsOf(ctx.tx, child.id)

      /** @type {(id: string) => string} */
      let mapId
      if (byValue) {
        for (const node of childNodes) ctx.tx.update('node', node.id, { systemId: parentId })
        for (const edge of childEdges) ctx.tx.update('edge', edge.id, { systemId: parentId })
        mapId = id => id
      } else {
        const idMap = copyContents(ctx, child.id, parentId)
        mapId = id => /** @type {string} */ (idMap.get(id))
      }

      for (const mirror of portsOf(ctx.tx, composite.id)) {
        const bp = mirror.boundaryPortId ? ctx.tx.get('boundaryPort', mirror.boundaryPortId) : null
        const target = bp?.internalPortId ? mapId(bp.internalPortId) : null
        for (const edge of edgesAtPort(ctx.tx, mirror.id)) {
          if (!target) {
            removeEdge(ctx, edge.id)
            continue
          }
          ctx.tx.update(
            'edge',
            edge.id,
            edge.fromPort === mirror.id ? { fromPort: target } : { toPort: target }
          )
        }
        for (const outer of ctx.tx.find('boundaryPort', 'internalPortId', mirror.id)) {
          ctx.tx.update('boundaryPort', outer.id, { internalPortId: target })
        }
        ctx.tx.remove('port', mirror.id)
      }

      const newNodeIds = childNodes.map(n => mapId(n.id))
      const source = childViews[0]?.layout ?? {}
      const origin = centroid(
        source,
        childNodes.map(n => n.id)
      ) ?? { x: 0, y: 0 }
      for (const view of viewsOf(ctx.tx, parentId)) {
        const at = view.layout[composite.id]
        const layout = { ...view.layout }
        delete layout[composite.id]
        if (at && typeof at.x === 'number' && typeof at.y === 'number') {
          const dx = at.x - origin.x
          const dy = at.y - origin.y
          for (const oldId of [...childNodes.map(n => n.id), ...childEdges.map(e => e.id)]) {
            if (source[oldId]) layout[mapId(oldId)] = offsetEntry(source[oldId], dx, dy)
          }
        }
        const wasHidden = view.hidden.includes(composite.id)
        const hidden = view.hidden.filter(id => id !== composite.id)
        ctx.tx.update('view', view.id, {
          layout,
          hidden: wasHidden ? [...hidden, ...newNodeIds] : hidden,
        })
      }

      ctx.tx.remove('node', composite.id)
      if (byValue) {
        for (const bp of boundaryPortsOf(ctx.tx, child.id)) removeBoundaryPort(ctx, bp.id)
        for (const view of childViews) ctx.tx.remove('view', view.id)
        ctx.tx.remove('system', child.id)
      }
      return newNodeIds
    },
  },
}
