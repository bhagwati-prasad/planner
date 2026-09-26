/**
 * Edge and boundary-port commands. Edges always connect ports, never raw nodes (spec §5);
 * boundary ports are a system's public interface when it is used as a component (spec §6).
 */
import { fail } from '../errors.js'
import { boundaryPortsOf, connectionTypeOf, referencingNodes } from '../model.js'
import {
  checkBoundaryMapping,
  checkConnection,
  createMirrorPort,
  nullableString,
  onlyKeys,
  optionalString,
  plainObject,
  removeBoundaryPort,
  removeEdge,
  requireDirection,
  requireString,
  stringList,
  validateProps,
} from './ops.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

export const edgeCommands = {
  'edge.add': {
    description: 'Connects an output port to an input port in the same system',
    signature: '{ fromPort, toPort, connectionType?, props?, label?, id? }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const { systemId, connectionType } = checkConnection(
        ctx.tx,
        requireString(p.fromPort, 'fromPort'),
        requireString(p.toPort, 'toPort'),
        p.connectionType === undefined
          ? undefined
          : nullableString(p.connectionType, 'connectionType')
      )
      p.connectionType = connectionType
      const props = plainObject(p.props, 'props') ?? {}
      validateProps(connectionTypeOf(ctx.registry, { connectionType }), props, 'the edge')
      const id = optionalString(p.id, 'id') ?? ctx.newId()
      ctx.tx.create('edge', {
        id,
        systemId,
        fromPort: p.fromPort,
        toPort: p.toPort,
        connectionType,
        props,
        label: optionalString(p.label, 'label') ?? '',
      })
      return id
    },
  },

  'edge.update': {
    description: 'Changes an edge’s label or connection type',
    signature: '{ id, changes: { label?, connectionType? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const edge = ctx.tx.require('edge', requireString(p.id, 'id'))
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['label', 'connectionType'], 'edge.update')
      optionalString(changes.label, 'label')
      if (changes.connectionType !== undefined) {
        changes.connectionType = checkConnection(
          ctx.tx,
          edge.fromPort,
          edge.toPort,
          nullableString(changes.connectionType, 'connectionType')
        ).connectionType
      }
      ctx.tx.update('edge', edge.id, changes)
    },
  },

  'edge.setProps': {
    description: 'Sets or clears edge properties (timeout, retries, routing rules, schema, ...)',
    signature: '{ id, props?: { key: value }, unset?: [key] }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const edge = ctx.tx.require('edge', requireString(p.id, 'id'))
      const props = plainObject(p.props, 'props') ?? {}
      validateProps(connectionTypeOf(ctx.registry, edge), props, edge.label || 'the edge')
      const next = { ...edge.props, ...props }
      for (const key of stringList(p.unset, 'unset') ?? []) delete next[key]
      ctx.tx.update('edge', edge.id, { props: next })
    },
  },

  'edge.rewire': {
    description: 'Moves one or both ends of an edge to other ports in the same system',
    signature: '{ id, fromPort?, toPort? }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const edge = ctx.tx.require('edge', requireString(p.id, 'id'))
      const fromPort = optionalString(p.fromPort, 'fromPort') ?? edge.fromPort
      const toPort = optionalString(p.toPort, 'toPort') ?? edge.toPort
      const { systemId } = checkConnection(ctx.tx, fromPort, toPort, edge.connectionType)
      if (systemId !== edge.systemId)
        fail('INVALID', 'An edge cannot be rewired into another system')
      ctx.tx.update('edge', edge.id, { fromPort, toPort })
    },
  },

  'edge.remove': {
    description: 'Removes an edge',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      removeEdge(ctx, ctx.tx.require('edge', requireString(p.id, 'id')).id)
    },
  },

  'boundary.add': {
    description:
      'Adds a boundary port to a system; every composite that places the system gains a matching port',
    signature:
      "{ systemId, name, direction: 'in'|'out'|'both', internalPortId?, description?, id? }",
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const system = ctx.tx.require('system', requireString(p.systemId, 'systemId'))
      const name = requireString(p.name, 'name').trim()
      const direction = requireDirection(p.direction, 'direction')
      if (boundaryPortsOf(ctx.tx, system.id).some(bp => bp.name === name)) {
        fail('CONFLICT', `System '${system.name}' already has a boundary port named '${name}'`)
      }
      const internalPortId = nullableString(p.internalPortId, 'internalPortId') ?? null
      if (internalPortId) checkBoundaryMapping(ctx.tx, system.id, direction, internalPortId)
      const id = optionalString(p.id, 'id') ?? ctx.newId()
      const bp = ctx.tx.create('boundaryPort', {
        id,
        systemId: system.id,
        name,
        direction,
        internalPortId,
        description: optionalString(p.description, 'description') ?? '',
      })
      for (const node of referencingNodes(ctx.tx, system.id)) createMirrorPort(ctx, node.id, bp)
      return id
    },
  },

  'boundary.update': {
    description: 'Renames a boundary port or maps it to another internal port (null unmaps it)',
    signature: '{ id, changes: { name?, internalPortId?, description? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const bp = ctx.tx.require('boundaryPort', requireString(p.id, 'id'))
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['name', 'internalPortId', 'description'], 'boundary.update')
      optionalString(changes.description, 'description')
      if (changes.internalPortId !== undefined) {
        const target = nullableString(changes.internalPortId, 'internalPortId')
        if (target) checkBoundaryMapping(ctx.tx, bp.systemId, bp.direction, target)
      }
      if (changes.name !== undefined) {
        changes.name = requireString(changes.name, 'name').trim()
        if (
          boundaryPortsOf(ctx.tx, bp.systemId).some(
            other => other.id !== bp.id && other.name === changes.name
          )
        ) {
          fail('CONFLICT', `The system already has a boundary port named '${changes.name}'`)
        }
        for (const mirror of ctx.tx.find('port', 'boundaryPortId', bp.id)) {
          ctx.tx.update('port', mirror.id, { name: changes.name })
        }
      }
      ctx.tx.update('boundaryPort', bp.id, changes)
    },
  },

  'boundary.remove': {
    description:
      'Removes a boundary port, the matching port on every composite that places the system, and their edges',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      removeBoundaryPort(ctx, requireString(p.id, 'id'))
    },
  },
}
