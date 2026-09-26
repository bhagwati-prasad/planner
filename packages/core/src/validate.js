/**
 * Model validation: produces the entries of the Problems panel (spec §9 bottom dock).
 * Commands keep the model consistent as it is edited; this pass reports what can still be
 * wrong (missing components, unmapped boundary ports, broken contracts) and guards against
 * data that arrived from a file or another replica.
 */
import { validateValue } from './props.js'
import { checkConnection } from './commands/ops.js'
import { checkContracts } from './rollup.js'
import {
  connectionTypeOf,
  isLibrarySystem,
  manifestOf,
  referencingNodes,
  requireProject,
} from './model.js'

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 }

/**
 * @typedef {object} Problem
 * @property {'error'|'warning'|'info'} severity
 * @property {string} code
 * @property {string} message
 * @property {string} kind      entity kind the problem is about
 * @property {string} id        entity id
 * @property {string|null} systemId
 */

/**
 * @param {import('./model.js').Source} src
 * @param {import('./registry.js').Registry|undefined} registry
 * @param {{ contracts?: boolean }} [options]
 * @returns {Problem[]}
 */
export function findProblems(src, registry, { contracts = true } = {}) {
  /** @type {Problem[]} */
  const out = []
  const add = (severity, code, message, kind, id, systemId = null) =>
    out.push({ severity, code, message, kind, id, systemId })
  requireProject(src)

  for (const node of src.all('node')) {
    if (!src.get('system', node.systemId))
      add('error', 'ORPHAN_NODE', `'${node.name}' belongs to a missing system`, 'node', node.id)
    if (node.kind === 'composite') {
      if (!src.get('system', node.systemRef))
        add(
          'error',
          'MISSING_SYSTEM',
          `'${node.name}' places a system that no longer exists`,
          'node',
          node.id,
          node.systemId
        )
      continue
    }
    const manifest = manifestOf(registry, node)
    if (!manifest) {
      add(
        'warning',
        'MISSING_COMPONENT',
        `'${node.name}' uses ${node.typeRef}, which is not installed; it is shown as a placeholder`,
        'node',
        node.id,
        node.systemId
      )
      continue
    }
    if (manifest.missingBase) {
      add(
        'warning',
        'MISSING_BASE',
        `'${node.name}' uses ${manifest.typeRef}, which extends '${manifest.missingBase}', which is not installed`,
        'node',
        node.id,
        node.systemId
      )
    }
    for (const [key, value] of Object.entries(node.props)) {
      const schema = manifest.properties[key]
      if (!schema) {
        add(
          'warning',
          'UNKNOWN_PROPERTY',
          `'${node.name}' has a value for '${key}', which ${manifest.typeRef} does not declare`,
          'node',
          node.id,
          node.systemId
        )
        continue
      }
      try {
        validateValue(schema, value, `${node.name}.${key}`)
      } catch (err) {
        add(
          'error',
          'INVALID_PROPERTY',
          /** @type {Error} */ (err).message,
          'node',
          node.id,
          node.systemId
        )
        continue
      }
      if (schema.type === 'ref' && !src.get('node', /** @type {string} */ (value))) {
        add(
          'error',
          'BROKEN_REFERENCE',
          `'${node.name}.${key}' refers to a node that no longer exists`,
          'node',
          node.id,
          node.systemId
        )
      }
    }
  }

  for (const edge of src.all('edge')) {
    if (!src.get('port', edge.fromPort) || !src.get('port', edge.toPort)) {
      add(
        'error',
        'BROKEN_EDGE',
        `Edge '${edge.label || edge.id}' is attached to a port that no longer exists`,
        'edge',
        edge.id,
        edge.systemId
      )
      continue
    }
    try {
      checkConnection(src, edge.fromPort, edge.toPort, edge.connectionType)
    } catch (err) {
      add(
        'error',
        'INVALID_EDGE',
        /** @type {Error} */ (err).message,
        'edge',
        edge.id,
        edge.systemId
      )
      continue
    }
    const keys = Object.keys(edge.props)
    if (!registry || !edge.connectionType || !keys.length) continue
    const name =
      edge.label ||
      `${src.get('node', src.get('port', edge.fromPort).nodeId)?.name} → ${src.get('node', src.get('port', edge.toPort).nodeId)?.name}`
    const type = connectionTypeOf(registry, edge)
    if (!type) {
      add(
        'warning',
        'MISSING_CONNECTION_TYPE',
        `Edge '${name}' uses the connection type '${edge.connectionType}', which is not installed; its properties are kept but not checked`,
        'edge',
        edge.id,
        edge.systemId
      )
      continue
    }
    for (const key of keys) {
      const schema = type.properties[key]
      if (!schema) {
        add(
          'warning',
          'UNKNOWN_PROPERTY',
          `Edge '${name}' has a value for '${key}', which ${type.typeRef} does not declare`,
          'edge',
          edge.id,
          edge.systemId
        )
        continue
      }
      try {
        validateValue(schema, edge.props[key], `${name}.${key}`)
      } catch (err) {
        add(
          'error',
          'INVALID_PROPERTY',
          /** @type {Error} */ (err).message,
          'edge',
          edge.id,
          edge.systemId
        )
      }
    }
  }

  for (const bp of src.all('boundaryPort')) {
    const system = src.get('system', bp.systemId)
    const where = system ? `'${system.name}'` : 'a missing system'
    if (!bp.internalPortId) {
      add(
        'warning',
        'UNMAPPED_BOUNDARY_PORT',
        `Boundary port '${bp.name}' of ${where} is not connected to anything inside`,
        'boundaryPort',
        bp.id,
        bp.systemId
      )
      continue
    }
    const port = src.get('port', bp.internalPortId)
    const owner = port && src.get('node', port.nodeId)
    if (!owner || owner.systemId !== bp.systemId) {
      add(
        'error',
        'BROKEN_BOUNDARY_PORT',
        `Boundary port '${bp.name}' of ${where} maps to a port outside the system`,
        'boundaryPort',
        bp.id,
        bp.systemId
      )
    }
  }

  for (const system of src.all('system')) {
    if (isLibrarySystem(src, system) && referencingNodes(src, system.id).length === 0) {
      add(
        'info',
        'UNUSED_SYSTEM',
        `Library system '${system.name}' is not placed anywhere`,
        'system',
        system.id,
        system.id
      )
    }
    if (!contracts || !Object.keys(system.contract ?? {}).length) continue
    for (const check of checkContracts(src, registry, system.id)) {
      if (check.status === 'violated')
        add('error', 'CONTRACT_VIOLATION', check.message, 'system', system.id, system.id)
    }
  }

  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.code.localeCompare(b.code) ||
      (a.id < b.id ? -1 : 1)
  )
}
