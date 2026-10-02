// @ts-check
/**
 * A run's input from the model (spec §6 "Black box or expanded", §7, §11 "Scope", tasks 0406,
 * 0412): core's `planModel` plans the components and edges as plain data, and this gives each
 * its behaviour, by its type id, and each stub the behaviour that answers for it. The worker does
 * the same for a run the page planned (ADR 0025).
 */
import { planModel } from '../../core/src/index.js'
import { withBehaviours } from './behaviours.js'

/**
 * @typedef {import('../../core/src/run-plan.js').RunMode} RunMode
 * @typedef {import('../../core/src/run-plan.js').Scope} Scope
 * @typedef {import('../../core/src/run-plan.js').PlanOptions & { behaviours?: Record<string, object> }} PlanOptions
 *   with `behaviours`, behaviour modules by component type id
 */

/**
 * A run's nodes and edges (spec §11 "Scope", eng §13): the components in its scope, each
 * composite in its mode, the edges between them, and a stub at the end of each edge leaving the
 * scope. Nothing outside the scope is planned. The edges entering it come back as `inbound`, for
 * a scenario or replayed traffic to drive.
 * @param {any} core  a Core, or anything with its read API
 * @param {PlanOptions} [options]
 * @example createRun({ seed: 7, ...planRun(core, { scope: { kind: 'selection', nodes: [serviceId] }, behaviours }) })
 */
export function planRun(core, { behaviours = {}, ...options } = {}) {
  return withBehaviours(planModel(core, options), manifest => behaviours[manifest.id])
}
