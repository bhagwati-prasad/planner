// @ts-check
/**
 * `strata.debug` (spec §13, §18, task 0429): the debugger's commands on the run being debugged,
 * the latest started unless one is attached. Breakpoints and every read go to the simulation
 * worker through the same protocol as the run's controls (ADR 0024, ADR 0025). Effective
 * properties add what a composite's inner system rolls up to beside each value, from the model,
 * since a run uses its black-box model, not its roll-ups (spec §7).
 */
import { fail } from '../../core/src/index.js'
import { CORE } from './internal.js'
import { READ, VIEW, pathIn } from './run.js'

/** The latest run strata.sim started; the facade's own. */
export const LATEST = Symbol('strata.sim.latest')

export class DebugApi {
  #strata
  /** @type {any} */
  #run = null

  /** @param {{ project: any, sim: any }} strata */
  constructor(strata) {
    this.#strata = strata
  }

  /** The run being debugged: the one attached, or the latest started */
  get run() {
    return (
      this.#run ??
      this.#strata.sim[LATEST] ??
      fail('NOT_FOUND', 'No run to debug: start one with strata.sim.start')
    )
  }

  /**
   * Debugs this run from now on.
   * @param {import('./run.js').RunHandle} run
   * @example strata.debug.attach(branch)
   */
  attach(run) {
    this.#run = run
    return this
  }

  /**
   * Pauses before the event in which something happens. It takes `{ on: 'call', node, method,
   * kind }`, `{ on: 'arrive', node, method }`, `{ on: 'depart', node, port }`, `{ on: 'edge', edge }`
   * or `{ on: 'log', name, node }` (spec §13).
   * @param {object} spec
   * @example await strata.debug.setBreakpoint({ on: 'call', node: db, method: 'lock' })
   */
  setBreakpoint(spec) {
    return this.run.setBreakpoint(spec)
  }

  /**
   * Removes every breakpoint.
   * @example await strata.debug.clearBreakpoints()
   */
  clearBreakpoints() {
    return this.run.clearBreakpoints()
  }

  /**
   * The hops of a request, the followed one by default, with their differences. Each has the
   * time since the hop before; the run must inspect: `strata.sim.start({ inspect: true })`.
   * @param {string} [trace]
   * @example (await strata.debug.hops()).map(h => h.diff)
   */
  hops(trace) {
    return this.run[READ]('hops', { trace })
  }

  /**
   * The followed request's calls still running, outermost first.
   * @example await strata.debug.methodStack()
   */
  methodStack() {
    return this.run[READ]('methodStack')
  }

  /**
   * A component's state at the run's moment.
   * @param {any} node
   * @example strata.debug.state(db)
   */
  state(node) {
    return this.run.state(node)
  }

  /**
   * Each property value the run uses for a component, with its source. The source is default,
   * override or run-only; a composite's values carry `rollup`, what its inner system rolls up to
   * (a distribution's median and p99).
   * @param {any} node
   * @example await strata.debug.effectiveProps(payments)
   */
  async effectiveProps(node) {
    const run = this.run
    const path = pathIn(node, Object.keys(run[VIEW]().components))
    const props = await run[READ]('effectiveProps', { node: path })
    const core = this.#strata.project[CORE]
    const at = path.split('/')
    if (core.get('node', at.at(-1))?.innerSystemRef) {
      const { systemId } = core.resolveSystem(at)
      /** @param {string} key */
      const roll = key => core.rollup(systemId, key).value
      for (const [key, entry] of Object.entries(props))
        try {
          // A distribution rolls up by its statistics.
          entry.rollup = entry.value?.kind
            ? { median: roll(`${key}.median`), p99: roll(`${key}.p99`) }
            : roll(key)
        } catch (err) {
          if (/** @type {any} */ (err).code !== 'NO_ROLLUP_RULE') throw err
        }
    }
    return props
  }
}
