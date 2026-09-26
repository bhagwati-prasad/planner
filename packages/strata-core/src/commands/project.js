/**
 * Project and system commands.
 */
import { fail } from '../errors.js'
import { SCHEMA_VERSION } from '../store.js'
import { ROLLUP_RULES } from '../props.js'
import { isPlainObject } from '../plain.js'
import { LEVEL_TAGS, projectOf, referencingNodes, requireProject } from '../model.js'
import {
  createSystem, deleteSystemDeep, nullableString, onlyKeys, optionalString, plainObject, requireString, stringList
} from './ops.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

/**
 * A contract declares targets for derived values, e.g. `{ "latency.p99": { max: 200, unit: "ms" } }`.
 * @param {unknown} value
 */
export function checkContract (value) {
  const contract = plainObject(value, 'contract')
  if (!contract) return undefined
  for (const [key, target] of Object.entries(contract)) {
    if (!isPlainObject(target)) fail('INVALID', `contract.${key} must be an object such as { max: 200, unit: 'ms' }`)
    onlyKeys(target, ['min', 'max', 'equals', 'unit', 'description'], `contract.${key}`)
    for (const bound of ['min', 'max']) {
      if (target[bound] !== undefined && (typeof target[bound] !== 'number' || !Number.isFinite(target[bound]))) {
        fail('INVALID', `contract.${key}.${bound} must be a number`)
      }
    }
    if (target.min === undefined && target.max === undefined && target.equals === undefined) {
      fail('INVALID', `contract.${key} needs min, max or equals`)
    }
  }
  return contract
}

/**
 * System-level roll-up overrides, e.g. `{ "latency.p99": "critical-path" }`.
 * @param {unknown} value
 */
export function checkRollups (value) {
  const rollups = plainObject(value, 'rollups')
  if (!rollups) return undefined
  for (const [key, spec] of Object.entries(rollups)) {
    const rule = typeof spec === 'string' ? spec : isPlainObject(spec) ? spec.rule : undefined
    if (!ROLLUP_RULES.includes(rule)) fail('INVALID', `rollups.${key} must be one of ${ROLLUP_RULES.join(', ')}`)
  }
  return rollups
}

/** @param {unknown} value @returns {string|null|undefined} */
function levelTag (value) {
  if (value === undefined || value === null) return /** @type {null|undefined} */ (value)
  if (!LEVEL_TAGS.includes(/** @type {string} */ (value))) fail('INVALID', `levelTag must be one of ${LEVEL_TAGS.join(', ')} or null`)
  return /** @type {string} */ (value)
}

export const projectCommands = {
  'project.init': {
    description: 'Creates the project and its root system; the first operation of every project',
    signature: '{ name, id?, settings? }',
    undoable: false,
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      if (projectOf(ctx.tx)) fail('CONFLICT', 'The project is already initialised')
      const name = requireString(p.name, 'name').trim()
      const projectId = optionalString(p.id, 'id') ?? ctx.newId()
      const rootSystemId = ctx.newId()
      ctx.tx.create('project', {
        id: projectId,
        name,
        description: '',
        rootSystemId,
        components: {},
        settings: plainObject(p.settings, 'settings') ?? {},
        schemaVersion: SCHEMA_VERSION
      })
      createSystem(ctx, { id: rootSystemId, name, levelTag: 'context' })
      return { projectId, rootSystemId }
    }
  },

  'project.update': {
    description: 'Renames the project or changes its description or settings',
    signature: '{ changes: { name?, description?, settings? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const project = requireProject(ctx.tx)
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['name', 'description', 'settings'], 'project.update')
      if (changes.name !== undefined) changes.name = requireString(changes.name, 'name').trim()
      optionalString(changes.description, 'description')
      plainObject(changes.settings, 'settings')
      ctx.tx.update('project', project.id, changes)
    }
  },

  'system.create': {
    description: 'Creates a library system that can be placed by reference or by value',
    signature: '{ name, id?, levelTag?, description?, contract?, rollups?, tags? }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      requireProject(ctx.tx)
      return createSystem(ctx, {
        id: optionalString(p.id, 'id'),
        name: requireString(p.name, 'name').trim(),
        levelTag: levelTag(p.levelTag) ?? null,
        description: optionalString(p.description, 'description'),
        contract: checkContract(p.contract),
        rollups: checkRollups(p.rollups),
        tags: stringList(p.tags, 'tags')
      })
    }
  },

  'system.update': {
    description: 'Changes a system’s name, level tag, description, contract, roll-up overrides or tags',
    signature: '{ id, changes: { name?, levelTag?, description?, contract?, rollups?, tags? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const system = ctx.tx.require('system', requireString(p.id, 'id'))
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['name', 'levelTag', 'description', 'contract', 'rollups', 'tags'], 'system.update')
      if (changes.name !== undefined) changes.name = requireString(changes.name, 'name').trim()
      levelTag(changes.levelTag)
      nullableString(changes.description, 'description')
      checkContract(changes.contract)
      checkRollups(changes.rollups)
      stringList(changes.tags, 'tags')
      ctx.tx.update('system', system.id, changes)
    }
  },

  'system.delete': {
    description: 'Deletes a library system and everything in it; it must not be placed anywhere',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const system = ctx.tx.require('system', requireString(p.id, 'id'))
      const project = requireProject(ctx.tx)
      if (system.id === project.rootSystemId) fail('INVALID', 'The root system cannot be deleted')
      if (system.ownerNodeId) fail('INVALID', `System '${system.name}' belongs to a composite node; remove that node instead`)
      const users = referencingNodes(ctx.tx, system.id)
      if (users.length) {
        fail('CONFLICT', `System '${system.name}' is placed by ${users.length} node(s): ${users.map(n => n.name).join(', ')}`, users.map(n => n.id))
      }
      deleteSystemDeep(ctx, system.id)
    }
  }
}
