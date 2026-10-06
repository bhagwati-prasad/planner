// @ts-check
/**
 * The debugger in the worker's run sessions (spec §13, ADR 0024, ADR 0025, task 0429): the
 * controls and reads strata-debug adds to strata-sim's run sessions, so the facade debugs a run
 * in the worker through the same protocol as every other control.
 *
 *   → run.control { run, action: 'setBreakpoint', args: spec }   a debugger breakpoint
 *                                                                (`{ on, … }`) or a control's
 *   → run.read    { run, what: 'hops', args: { trace } }         the run must inspect
 *   → run.read    { run, what: 'methodStack' }
 *   → run.read    { run, what: 'effectiveProps', args: { node } }
 */
import { createDebugger } from './debugger.js'

/** @typedef {import('../../sim/src/sessions.js').Extensions} Extensions */

/**
 * A debugger over a run as it is at its own moment: its run and the trace it follows.
 * @param {{ run: any, following: string|null }} at
 */
const over = at => createDebugger(/** @type {any} */ (at))

/** @type {Extensions} */
export const debugExtensions = {
  actions: {
    setBreakpoint: (control, spec) =>
      'on' in spec ? createDebugger(control).setBreakpoint(spec) : control.setBreakpoint(spec),
  },
  reads: {
    hops: (at, { trace }) => over(at).hops(trace ?? at.following),
    methodStack: at => over(at).methodStack(),
    effectiveProps: (at, { node }) => over(at).effectiveProps(node),
  },
}
