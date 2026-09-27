/**
 * Edge and boundary-port commands. Edges always connect ports, never raw nodes (spec §5);
 * boundary ports are a system's public interface when it is used as a component (spec §6).
 */
import { fail } from '../errors.js'
import { SYSTEM_TYPE_REF } from '../builtins.js'
import {
  boundaryPortsOf,
  connectionTypeOf,
  exposedMethods,
  portsOf,
  publicMethods,
  reachableFrom,
  referencingNodes,
} from '../model.js'
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

/**
 * The public method an edge calls (ADR 0011): null for any the target port exposes, or one it
 * exposes. A private method is never reachable over an edge.
 * @param {Ctx} ctx
 * @param {string} toPort
 * @param {unknown} value
 * @returns {string|null}
 */
function checkEdgeMethod(ctx, toPort, value) {
  const method = value === undefined ? null : nullableString(value, 'method')
  if (method === null) return null
  const port = ctx.tx.require('port', toPort)
  if (!exposedMethods(ctx.tx, ctx.registry, port).includes(method)) {
    const node = ctx.tx.require('node', port.nodeId)
    fail('E_METHOD_NOT_EXPOSED', `'${node.name}.${port.name}' does not expose '${method}'`, {
      portId: port.id,
      method,
    })
  }
  return method
}

export const edgeCommands = {
  'edge.add': {
    description:
      'Connects an output port to an input port in the same system, optionally naming the public method it calls',
    signature: '{ fromPort, toPort, connectionType?, method?, props?, label?, id? }',
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
      const props = validateProps(
        connectionTypeOf(ctx.registry, { connectionType }),
        plainObject(p.props, 'props') ?? {},
        'the edge'
      )
      const method = checkEdgeMethod(ctx, p.toPort, p.method)
      const id = optionalString(p.id, 'id') ?? ctx.newId()
      ctx.tx.create('edge', {
        id,
        systemId,
        fromPort: p.fromPort,
        toPort: p.toPort,
        connectionType,
        method,
        props,
        label: optionalString(p.label, 'label') ?? '',
      })
      return id
    },
  },

  'edge.update': {
    description:
      'Changes an edge’s label, connection type or the method it calls (null calls any the port exposes)',
    signature: '{ id, changes: { label?, connectionType?, method? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const edge = ctx.tx.require('edge', requireString(p.id, 'id'))
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['label', 'connectionType', 'method'], 'edge.update')
      optionalString(changes.label, 'label')
      if (changes.method !== undefined)
        changes.method = checkEdgeMethod(ctx, edge.toPort, changes.method)
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
      const props = validateProps(
        connectionTypeOf(ctx.registry, edge),
        plainObject(p.props, 'props') ?? {},
        edge.label || 'the edge'
      )
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
        bindings: {},
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

  'boundary.bind': {
    description:
      "Binds a public method of the system's owner, on a boundary port, to a public method of a component inside that the port reaches",
    signature: '{ boundaryPortId, method, nodeId, target }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const bp = ctx.tx.require('boundaryPort', requireString(p.boundaryPortId, 'boundaryPortId'))
      const method = requireString(p.method, 'method')
      const node = ctx.tx.require('node', requireString(p.nodeId, 'nodeId'))
      const target = requireString(p.target, 'target')
      const system = ctx.tx.require('system', bp.systemId)
      const owner = system.ownerNodeId ? ctx.tx.get('node', system.ownerNodeId) : null
      // A System component declares its methods by binding them; any other owner exposes them
      // through its manifest (ADR 0010).
      if (owner && owner.typeRef !== SYSTEM_TYPE_REF) {
        const mirror = portsOf(ctx.tx, owner.id).find(q => q.boundaryPortId === bp.id)
        if (!mirror || !exposedMethods(ctx.tx, ctx.registry, mirror).includes(method))
          fail(
            'E_METHOD_NOT_EXPOSED',
            `'${owner.name}.${bp.name}' does not expose a public method '${method}'`,
            { boundaryPortId: bp.id, method }
          )
      }
      if (node.systemId !== bp.systemId || !reachableFrom(ctx.tx, bp).has(node.id))
        fail(
          'E_METHOD_UNREACHABLE',
          `'${node.name}' is not reachable from the boundary port '${bp.name}'`,
          { boundaryPortId: bp.id, nodeId: node.id }
        )
      if (!publicMethods(ctx.tx, ctx.registry, node).includes(target))
        fail('E_METHOD_UNKNOWN', `'${node.name}' has no public method '${target}'`, {
          nodeId: node.id,
          method: target,
        })
      ctx.tx.update('boundaryPort', bp.id, {
        bindings: { ...bp.bindings, [method]: { nodeId: node.id, method: target } },
      })
    },
  },

  'boundary.unbind': {
    description: 'Removes the binding of a public method from a boundary port',
    signature: '{ boundaryPortId, method }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const bp = ctx.tx.require('boundaryPort', requireString(p.boundaryPortId, 'boundaryPortId'))
      const method = requireString(p.method, 'method')
      if (!bp.bindings?.[method])
        fail('E_METHOD_UNBOUND', `'${method}' is not bound on the boundary port '${bp.name}'`, {
          boundaryPortId: bp.id,
          method,
        })
      const { [method]: _removed, ...rest } = bp.bindings
      ctx.tx.update('boundaryPort', bp.id, { bindings: rest })
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
