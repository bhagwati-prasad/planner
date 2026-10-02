// @ts-check
/**
 * Behaviours for a planned run (tasks 0412, 0417): core's `planModel` plans a run as plain data,
 * and the run gives each component its behaviour, by its manifest, and each stub the behaviour
 * that answers for it. strata-sim's `planRun` and the worker's run sessions both use it, so the
 * worker carries no planning code.
 */
import { stubBehaviour } from './stubs.js'

/**
 * @typedef {{ nodes: import('../../core/src/run-plan.js').PlannedNode[], edges: import('./run.js').RunEdge[], inbound?: import('./run.js').RunEdge[] }} Plan
 */

/**
 * A planned run with its behaviours: each stub's from its configuration, and every other
 * component's from `behaviourOf`, which takes its manifest.
 * @param {Plan} plan
 * @param {(manifest: any) => object|undefined} behaviourOf
 * @returns {{ nodes: import('./run.js').RunNode[], edges: import('./run.js').RunEdge[], inbound: import('./run.js').RunEdge[] }}
 */
export function withBehaviours({ nodes, edges, inbound = [] }, behaviourOf) {
  return {
    nodes: nodes.map(({ stub, ...node }) => ({
      ...node,
      behaviour: stub ? stubBehaviour(node.manifest, stub) : behaviourOf(node.manifest),
    })),
    edges,
    inbound,
  }
}
