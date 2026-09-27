/**
 * Structural roll-up (spec §7): extract a selection as a child system, and the inverse,
 * inlining a composite back into its parent. Each is one command, so one undo step, that runs
 * the primitive commands a pure planner returns (planners.js, eng §7, ADR 0012).
 */
import { planExtract, planInline } from '../planners.js'
import { requireString } from './ops.js'

/** @typedef {import('../bus.js').HandlerContext} Ctx */

export const recursionCommands = {
  'system.extract': {
    description:
      'Moves the selected nodes into a new child system, creating a boundary port for every crossing edge, binding the methods called across them, and rewiring those edges to the new composite',
    signature: '{ systemId, nodeIds: [id], name?, id?, nodeId? }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const plan = planExtract(ctx.tx, ctx.registry, p, ctx.newId)
      p.name = plan.name
      for (const command of plan.commands) ctx.exec(command.type, command.payload)
      return { systemId: plan.systemId, nodeId: plan.nodeId }
    },
  },

  'system.inline': {
    description:
      'Dissolves a composite back into its parent and reconnects edges through its boundary ports (a by-reference composite is copied, leaving the library system untouched)',
    signature: '{ nodeId }',
    /** @param {any} p @param {Ctx} ctx */
    handler(p, ctx) {
      const composite = ctx.tx.require('node', requireString(p.nodeId, 'nodeId'))
      if (composite.innerSystemRef && composite.placement !== 'value')
        ctx.exec('node.detach', { id: composite.id })
      const plan = planInline(ctx.tx, ctx.registry, p)
      for (const command of plan.commands) ctx.exec(command.type, command.payload)
      return plan.nodeIds
    },
  },
}
