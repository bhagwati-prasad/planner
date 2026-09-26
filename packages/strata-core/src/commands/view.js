/**
 * View commands. The model records what exists; views record how it is drawn (spec §5):
 * positions, sizes, waypoints, layers and which elements are hidden. Deleting from a view only
 * hides; deleting from the model removes the element from every view.
 */
import { fail } from '../errors.js'
import { isPlainObject } from '../plain.js'
import { VIEW_KINDS, viewsOf } from '../model.js'
import { createView, onlyKeys, oneOf, optionalString, plainObject, requireString, stringList } from './ops.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

/**
 * Elements a view of `systemId` may lay out: the system's nodes and edges.
 * @param {Ctx} ctx
 * @param {any} view
 * @param {string} elementId
 */
function requireViewElement (ctx, view, elementId) {
  const element = ctx.tx.get('node', elementId) ?? ctx.tx.get('edge', elementId)
  if (!element) fail('NOT_FOUND', `No node or edge '${elementId}' to show in view '${view.name}'`)
  if (element.systemId !== view.systemId) fail('INVALID', `'${element.name ?? elementId}' belongs to another system than view '${view.name}'`)
}

/** @param {unknown} entry @param {string} label */
function checkLayoutEntry (entry, label) {
  if (!isPlainObject(entry)) fail('INVALID', `${label} must be an object such as { x, y }`)
  const e = /** @type {Record<string, any>} */ (entry)
  onlyKeys(e, ['x', 'y', 'w', 'h', 'waypoints', 'layer', 'collapsed'], label)
  for (const key of ['x', 'y', 'w', 'h']) {
    if (e[key] !== undefined && (typeof e[key] !== 'number' || !Number.isFinite(e[key]))) fail('INVALID', `${label}.${key} must be a number`)
  }
  for (const key of ['w', 'h']) if (e[key] !== undefined && e[key] < 0) fail('INVALID', `${label}.${key} must be >= 0`)
  if (e.waypoints !== undefined) {
    if (!Array.isArray(e.waypoints) || e.waypoints.some(pt => !isPlainObject(pt) || !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) {
      fail('INVALID', `${label}.waypoints must be a list of { x, y }`)
    }
  }
  optionalString(e.layer, `${label}.layer`)
}

/** @param {unknown} layers */
function checkLayers (layers) {
  if (!Array.isArray(layers) || layers.length === 0) fail('INVALID', 'layers must be a non-empty list')
  const ids = new Set()
  for (const [i, layer] of layers.entries()) {
    if (!isPlainObject(layer)) fail('INVALID', `layers[${i}] must be an object`)
    const id = requireString(layer.id, `layers[${i}].id`)
    if (ids.has(id)) fail('INVALID', `Duplicate layer id '${id}'`)
    ids.add(id)
    requireString(layer.name, `layers[${i}].name`)
    for (const flag of ['locked', 'hidden']) {
      if (layer[flag] !== undefined && typeof layer[flag] !== 'boolean') fail('INVALID', `layers[${i}].${flag} must be true or false`)
    }
  }
}

export const viewCommands = {
  'view.create': {
    description: 'Adds a view (page) to a system',
    signature: "{ systemId, name, kind?: 'logical'|'deployment'|'dataflow'|'custom', id? }",
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const system = ctx.tx.require('system', requireString(p.systemId, 'systemId'))
      return createView(ctx, system.id, {
        id: optionalString(p.id, 'id'),
        name: requireString(p.name, 'name').trim(),
        kind: oneOf(p.kind, VIEW_KINDS, 'kind') ?? 'logical'
      })
    }
  },

  'view.update': {
    description: 'Renames a view or changes its kind, layers, filters or styles',
    signature: '{ id, changes: { name?, kind?, layers?, filters?, styles? } }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const view = ctx.tx.require('view', requireString(p.id, 'id'))
      const changes = plainObject(p.changes, 'changes') ?? {}
      onlyKeys(changes, ['name', 'kind', 'layers', 'filters', 'styles'], 'view.update')
      if (changes.name !== undefined) changes.name = requireString(changes.name, 'name').trim()
      oneOf(changes.kind, VIEW_KINDS, 'kind')
      if (changes.layers !== undefined) checkLayers(changes.layers)
      plainObject(changes.filters, 'filters')
      plainObject(changes.styles, 'styles')
      ctx.tx.update('view', view.id, changes)
    }
  },

  'view.remove': {
    description: 'Removes a view; a system keeps at least one',
    signature: '{ id }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const view = ctx.tx.require('view', requireString(p.id, 'id'))
      if (viewsOf(ctx.tx, view.systemId).length <= 1) fail('INVALID', 'A system must keep at least one view')
      ctx.tx.remove('view', view.id)
    }
  },

  'view.layout': {
    description: 'Positions, sizes or routes elements in a view (entries merge with existing ones), or clears them',
    signature: '{ viewId, set?: { elementId: { x, y, w?, h?, waypoints?, layer? } }, unset?: [elementId] }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const view = ctx.tx.require('view', requireString(p.viewId, 'viewId'))
      const set = plainObject(p.set, 'set') ?? {}
      const unset = stringList(p.unset, 'unset') ?? []
      const layout = { ...view.layout }
      const layerIds = new Set(view.layers.map(l => l.id))
      for (const [id, entry] of Object.entries(set)) {
        requireViewElement(ctx, view, id)
        checkLayoutEntry(entry, `set.${id}`)
        if (entry.layer !== undefined && !layerIds.has(entry.layer)) fail('NOT_FOUND', `View '${view.name}' has no layer '${entry.layer}'`)
        layout[id] = { ...(layout[id] ?? {}), ...entry }
      }
      for (const id of unset) delete layout[id]
      ctx.tx.update('view', view.id, { layout })
    }
  },

  'view.hide': {
    description: 'Hides elements in one view without removing them from the model',
    signature: '{ viewId, ids: [elementId] }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const view = ctx.tx.require('view', requireString(p.viewId, 'viewId'))
      const ids = stringList(p.ids, 'ids') ?? []
      for (const id of ids) requireViewElement(ctx, view, id)
      const hidden = [...new Set([...view.hidden, ...ids])]
      ctx.tx.update('view', view.id, { hidden })
    }
  },

  'view.show': {
    description: 'Shows elements previously hidden in a view',
    signature: '{ viewId, ids: [elementId] }',
    /** @param {any} p @param {Ctx} ctx */
    handler (p, ctx) {
      const view = ctx.tx.require('view', requireString(p.viewId, 'viewId'))
      const ids = new Set(stringList(p.ids, 'ids') ?? [])
      ctx.tx.update('view', view.id, { hidden: view.hidden.filter(id => !ids.has(id)) })
    }
  }
}
