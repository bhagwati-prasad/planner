/**
 * Node and port commands.
 */
import { fail } from '../errors.js'
import { compareSemver } from '../semver.js'
import { SYSTEM_TYPE_REF } from '../builtins.js'
import { parseTypeRef, typeRefOf } from '../registry.js'
import {
  NODE_STATUSES,
  PLACEMENTS,
  manifestOf,
  nodesOf,
  portsOf,
  requireProject,
  wouldCycle,
} from '../model.js'
import {
  cloneSystem,
  createMirrorPorts,
  createSystem,
  deleteSystemDeep,
  linkBoundaryPort,
  removeBoundaryPort,
  nullableString,
  oneOf,
  onlyKeys,
  optionalString,
  plainObject,
  removeNode,
  removePort,
  requireDirection,
  requireString,
  stringList,
  uniqueName,
  validateProps,
} from './ops.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

/**
 * Resolves the type named in component.add to a pinned `id@version`. Unversioned names use the
 * version the project already pins, else the latest registered. A versioned reference that
 * is not installed becomes a placeholder, so projects open without all their components.
 * @param {Ctx} ctx
 * @param {string} ref
 */
function resolveType(ctx, ref) {
  const registry = ctx.registry
  const { version } = parseTypeRef(ref)
  const found = registry?.find(ref) ?? null
  if (!found) {
    if (version) return { typeRef: ref, manifest: null }
    if (registry) registry.require(ref)
    fail('NOT_FOUND', `Unknown component type '${ref}' (no registry available)`)
  }
  if (found.kind === 'connection-type') {
    fail(
      'INVALID',
      `'${found.id}' is a connection type, not a component; use it to connect nodes, e.g. system.connect(a, b, { type: '${found.id}' })`
    )
  }
  let typeRef = typeRefOf(found)
  if (!version) {
    const pinned = Object.keys(requireProject(ctx.tx).components)
      .map(key => parseTypeRef(key))
      .filter(r => r.id === found.id && r.version && registry?.get(`${r.id}@${r.version}`))
      .sort((a, b) =>
        compareSemver(/** @type {string} */ (b.version), /** @type {string} */ (a.version))
      )
    if (pinned.length) typeRef = `${found.id}@${pinned[0].version}`
  }
  const manifest = registry?.resolve(typeRef) ?? null
  if (manifest?.id === 'strata.system')
    fail(
      'INVALID',
      'A System component is placed, not added: use node.place with a system, or system.extract'
    )
  if (manifest?.abstract)
    fail('INVALID', `'${manifest.id}' is an abstract base type; use a component that extends it`)
  return { typeRef, manifest }
}

/** @param {unknown} specs */
function checkPortSpecs(specs) {
  if (!Array.isArray(specs)) fail('INVALID', 'ports must be a list')
  const names = new Set()
  return specs.map((s, i) => {
    const name = requireString(s?.name, `ports[${i}].name`)
    if (names.has(name)) fail('INVALID', `Duplicate port name '${name}'`)
    names.add(name)
    return {
      name,
      direction: requireDirection(s.direction, `ports[${i}].direction`),
      accepts: stringList(s.accepts, `ports[${i}].accepts`) ?? [],
    }
  })
}

/** @param {any} p @param {string} label */
function nodeFields(p, label) {
  return {
    description: optionalString(p.description, `${label}.description`),
    tags: stringList(p.tags, `${label}.tags`),
    owner: nullableString(p.owner, `${label}.owner`),
    status: oneOf(p.status, NODE_STATUSES, `${label}.status`),
  }
}

/** @param {Ctx} ctx @param {string} id */
function requireAtomic(ctx, id) {
  const node = ctx.tx.require('node', id)
  if (node.typeRef === SYSTEM_TYPE_REF)
    fail(
      'INVALID',
      `'${node.name}' is a composite; its values are derived from the system it contains`
    )
  return node
}

export const nodeCommands = {
  'component.add': {
    description: 'Adds a component to a system; its ports come from the component manifest',
    signature: '{ systemId, typeRef, name?, props?, tags?, owner?, status?, description?, id? }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const system = ctx.tx.require('system', requireString(p.systemId, 'systemId'))
      const project = requireProject(ctx.tx)
      const { typeRef, manifest } = resolveType(ctx, requireString(p.typeRef, 'typeRef'))
      const fields = nodeFields(p, 'node')
      const name =
        p.name !== undefined
          ? requireString(p.name, 'name').trim()
          : uniqueName(
              nodesOf(ctx.tx, system.id).map(n => n.name),
              manifest?.name ?? parseTypeRef(typeRef).id
            )
      const props = validateProps(manifest, plainObject(p.props, 'props') ?? {}, name)
      const ports = checkPortSpecs(p.ports ?? manifest?.ports ?? [])

      // Normalise the logged payload so replay needs no registry and yields the same node.
      p.typeRef = typeRef
      p.name = name
      p.ports = ports

      if (!(typeRef in project.components)) {
        ctx.tx.update('project', project.id, {
          components: { ...project.components, [typeRef]: {} },
        })
      }
      const id = optionalString(p.id, 'id') ?? ctx.newId()
      ctx.tx.create('node', {
        id,
        systemId: system.id,
        typeRef,
        innerSystemRef: null,
        placement: null,
        name,
        description: fields.description ?? '',
        props,
        tags: fields.tags ?? [],
        owner: fields.owner ?? null,
        status: fields.status ?? 'planned',
      })
      for (const spec of ports) {
        ctx.tx.create('port', {
          id: ctx.newId(),
          nodeId: id,
          ...spec,
          declared: true,
          boundaryPortId: null,
        })
      }
      return id
    },
  },

  'node.place': {
    description:
      'Places a system inside another as a composite node, by reference (linked, read-only) or by value (an editable copy)',
    signature: "{ systemId, systemRef, placement?: 'reference'|'value', name?, id? }",
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const container = ctx.tx.require('system', requireString(p.systemId, 'systemId'))
      const target = ctx.tx.require('system', requireString(p.systemRef, 'systemRef'))
      const placement = oneOf(p.placement ?? 'reference', PLACEMENTS, 'placement')
      const project = requireProject(ctx.tx)
      if (target.id === project.rootSystemId)
        fail('INVALID', 'The root system cannot be placed inside another system')
      if (wouldCycle(ctx.tx, container.id, target.id)) {
        fail(
          'E_SYSTEM_CYCLE',
          `Placing '${target.name}' inside '${container.name}' would make a system contain itself`,
          { systemId: container.id, systemRef: target.id }
        )
      }
      if (placement === 'reference' && target.ownerNodeId) {
        fail(
          'INVALID',
          `'${target.name}' is owned by another composite node; place it by value, or save it as a library system first`
        )
      }
      const name =
        p.name !== undefined
          ? requireString(p.name, 'name').trim()
          : uniqueName(
              nodesOf(ctx.tx, container.id).map(n => n.name),
              target.name
            )
      p.name = name
      p.placement = placement
      const id = optionalString(p.id, 'id') ?? ctx.newId()
      const innerSystemRef =
        placement === 'value'
          ? cloneSystem(ctx, target.id, { ownerNodeId: id }).systemId
          : target.id
      ctx.tx.create('node', {
        id,
        systemId: container.id,
        typeRef: SYSTEM_TYPE_REF,
        innerSystemRef,
        placement,
        name,
        description: '',
        props: {},
        tags: [],
        owner: null,
        status: 'planned',
      })
      createMirrorPorts(ctx, id, innerSystemRef)
      return id
    },
  },

  'node.update': {
    description: 'Renames a node or changes its description, tags, owner or status',
    signature: '{ id, changes: { name?, description?, tags?, owner?, status? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const node = ctx.tx.require('node', requireString(p.id, 'id'))
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['name', 'description', 'tags', 'owner', 'status'], 'node.update')
      if (changes.name !== undefined) changes.name = requireString(changes.name, 'name').trim()
      nodeFields(changes, 'changes')
      ctx.tx.update('node', node.id, changes)
    },
  },

  'node.setProps': {
    description:
      'Sets or clears property values on an atomic node (validated against its manifest)',
    signature: '{ id, props?: { key: value }, unset?: [key] }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const node = requireAtomic(ctx, requireString(p.id, 'id'))
      const props = validateProps(
        manifestOf(ctx.registry, node),
        plainObject(p.props, 'props') ?? {},
        node.name
      )
      const unset = stringList(p.unset, 'unset') ?? []
      const next = { ...node.props, ...props }
      for (const key of unset) delete next[key]
      ctx.tx.update('node', node.id, { props: next })
    },
  },

  'node.remove': {
    description:
      'Removes a node from the model (and every view), with its ports and edges; a composite placed by value takes its system with it',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      removeNode(ctx, ctx.tx.require('node', requireString(p.id, 'id')).id)
    },
  },

  'node.detach': {
    description: 'Turns a by-reference composite into an editable copy (by value)',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const node = ctx.tx.require('node', requireString(p.id, 'id'))
      if (!node.innerSystemRef || node.placement !== 'reference')
        fail('INVALID', `'${node.name}' is not placed by reference`)
      const { systemId, idMap } = cloneSystem(ctx, node.innerSystemRef, { ownerNodeId: node.id })
      ctx.tx.update('node', node.id, { innerSystemRef: systemId, placement: 'value' })
      for (const port of portsOf(ctx.tx, node.id)) {
        if (port.boundaryPortId)
          ctx.tx.update('port', port.id, { boundaryPortId: idMap.get(port.boundaryPortId) ?? null })
      }
      return systemId
    },
  },

  'port.add': {
    description: 'Adds an extra port to an atomic node, beyond those its manifest declares',
    signature: "{ nodeId, name, direction: 'in'|'out'|'both', accepts?: [type], id? }",
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const node = requireAtomic(ctx, requireString(p.nodeId, 'nodeId'))
      const name = requireString(p.name, 'name').trim()
      if (portsOf(ctx.tx, node.id).some(port => port.name === name))
        fail('CONFLICT', `'${node.name}' already has a port named '${name}'`)
      const id = optionalString(p.id, 'id') ?? ctx.newId()
      ctx.tx.create('port', {
        id,
        nodeId: node.id,
        name,
        direction: requireDirection(p.direction, 'direction'),
        accepts: stringList(p.accepts, 'accepts') ?? [],
        declared: false,
        boundaryPortId: null,
      })
      // An opened component's boundary mirrors its ports, in the same batch (spec §7).
      if (node.innerSystemRef)
        linkBoundaryPort(ctx, node.innerSystemRef, ctx.tx.require('port', id))
      return id
    },
  },

  'port.update': {
    description: 'Renames an extra port or changes the connection types it accepts',
    signature: '{ id, changes: { name?, accepts? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const port = ctx.tx.require('port', requireString(p.id, 'id'))
      if (port.declared)
        fail('INVALID', `Port '${port.name}' is declared by the component and cannot be changed`)
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['name', 'accepts'], 'port.update')
      if (changes.name !== undefined) {
        changes.name = requireString(changes.name, 'name').trim()
        if (
          portsOf(ctx.tx, port.nodeId).some(
            other => other.id !== port.id && other.name === changes.name
          )
        ) {
          fail('CONFLICT', `The node already has a port named '${changes.name}'`)
        }
      }
      stringList(changes.accepts, 'accepts')
      ctx.tx.update('port', port.id, changes)
      if (changes.name !== undefined && port.boundaryPortId && ownsInnerSystem(ctx, port.nodeId))
        ctx.tx.update('boundaryPort', port.boundaryPortId, { name: changes.name })
    },
  },

  'port.remove': {
    description: 'Removes an extra port and its edges',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const port = ctx.tx.require('port', requireString(p.id, 'id'))
      if (port.declared)
        fail('INVALID', `Port '${port.name}' is declared by the component and cannot be removed`)
      // Removing the boundary port an opened component mirrors removes this port with it.
      if (port.boundaryPortId && ownsInnerSystem(ctx, port.nodeId))
        removeBoundaryPort(ctx, port.boundaryPortId)
      else removePort(ctx, port.id)
    },
  },

  'component.openAsSystem': {
    description:
      'Gives a component an inner system of its own, with a boundary port for each of its ports; it keeps its type and behaviour as its black-box model',
    signature: '{ id, name? }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const node = ctx.tx.require('node', requireString(p.id, 'id'))
      if (node.innerSystemRef)
        fail('E_SYSTEM_EXISTS', `'${node.name}' already has an inner system`, {
          nodeId: node.id,
          systemId: node.innerSystemRef,
        })
      const systemId = createSystem(ctx, {
        name: p.name !== undefined ? requireString(p.name, 'name').trim() : node.name,
        ownerNodeId: node.id,
      })
      for (const port of portsOf(ctx.tx, node.id)) linkBoundaryPort(ctx, systemId, port)
      ctx.tx.update('node', node.id, { innerSystemRef: systemId, placement: 'value' })
      return systemId
    },
  },

  'component.removeInnerSystem': {
    description:
      "Deletes a component's inner system and everything in it, leaving the component a black box",
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const node = ctx.tx.require('node', requireString(p.id, 'id'))
      if (!node.innerSystemRef)
        fail('E_SYSTEM_NONE', `'${node.name}' has no inner system`, { nodeId: node.id })
      if (node.typeRef === SYSTEM_TYPE_REF)
        fail('E_SYSTEM_REQUIRED', `'${node.name}' is a System, whose inner system is required`, {
          nodeId: node.id,
        })
      for (const port of portsOf(ctx.tx, node.id))
        if (port.boundaryPortId) ctx.tx.update('port', port.id, { boundaryPortId: null })
      deleteSystemDeep(ctx, node.innerSystemRef)
      ctx.tx.update('node', node.id, { innerSystemRef: null, placement: null })
    },
  },
}

/**
 * Whether a node owns its inner system, so that its ports and that system's boundary ports are
 * kept in step: an opened component (spec §7).
 * @param {Ctx} ctx
 * @param {string} nodeId
 */
function ownsInnerSystem(ctx, nodeId) {
  const node = ctx.tx.get('node', nodeId)
  return !!node?.innerSystemRef && node.typeRef !== SYSTEM_TYPE_REF
}
