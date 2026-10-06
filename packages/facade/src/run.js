// @ts-check
/**
 * Run handles (spec §12, §18, ADR 0025): a run in the simulation worker with every control of
 * spec §12. Each control is a protocol message, and its reply is a view of the moment it left
 * the run at, which the handle keeps, so `status`, `position`, `state(node)` and the rest read it
 * without a round trip. A playing run's views arrive as it plays.
 */
import { StrataError, fail } from '../../core/src/index.js'
import { INSPECT } from './internal.js'

/** Reads or replaces a handle's view; the facade's own. */
export const VIEW = Symbol('strata.run.view')
/** Reads something of the run from the worker; the facade's own. */
export const READ = Symbol('strata.run.read')

/** The step units of spec §12 by their console names, as strata-sim names them. */
const UNITS = /** @type {Record<string, string>} */ ({
  followedHop: 'followed',
  methodCall: 'call',
})

/**
 * A moment as the console gives it, `{ event }` or `{ timeMs }`, as the worker takes it.
 * @param {{ event?: number, timeMs?: number, timeUs?: number }} moment
 * @example momentOf({ timeMs: 250 })
 */
export const momentOf = ({ event, timeMs, timeUs }) =>
  event !== undefined
    ? { event }
    : { timeUs: timeUs ?? Math.round(/** @type {number} */ (timeMs) * 1000) }

/**
 * The path of a component among a run's paths: a node handle, its id, or its path.
 * @param {any} node @param {string[]} paths
 * @example pathIn(db, ['orders/svc', 'orders/db'])
 */
export function pathIn(node, paths) {
  const id = String(node?.id ?? node)
  const found = paths.filter(p => p === id || p.endsWith(`/${id}`))
  if (found.length === 1) return found[0]
  return fail(
    found.length ? 'INVALID' : 'NOT_FOUND',
    found.length
      ? `'${id}' runs in more than one place (${found.join(', ')}); give its path`
      : `'${id}' is not in this run`
  )
}

/**
 * @typedef {object} RunLink  what a handle needs from strata.sim
 * @property {(type: string, payload: object) => Promise<any>} ask
 * @property {(view: any, handle?: RunHandle, before?: string) => RunHandle} track
 * @property {(handle: RunHandle) => void} forget
 * @property {(commands: any[]) => void} keep  dispatches commands as one undoable change
 */

export class RunHandle {
  /** @type {RunLink} */
  #link
  /** @type {any} */
  #view
  /** @type {Promise<unknown>[]} edits on their way, ahead of the next control */
  #sent = []

  /** @param {RunLink} link @param {any} view */
  constructor(link, view) {
    this.#link = link
    this.#view = view
  }

  /** @param {any} [view] */
  [VIEW](view) {
    if (view) this.#view = view
    return this.#view
  }

  /** The run's id in its run tree, such as s1.run-2 */
  get id() {
    return this.#view.run
  }

  /** ready, playing, paused, finished or stopped (spec §12 "Run states") */
  get status() {
    return this.#view.status
  }

  /** Where the run is: `{ event, timeUs }` */
  get position() {
    return { ...this.#view.position }
  }

  /** How fast it plays: 0.1 to Infinity times simulated time */
  get speed() {
    return this.#view.speed
  }

  /** The trace of the request being followed, or null */
  get following() {
    return this.#view.following
  }

  /** The call the debugger is in, in the followed request, or null */
  get frame() {
    return this.#view.frame
  }

  /** The run tree: each run with its parent, branch point, edits, seed and hash */
  get runs() {
    return this.#view.runs
  }

  /** The run-only edits, with the moment each was made in the run */
  get edits() {
    return this.#view.edits
  }

  /** How a paused run may go on with its edits: resume, replay, restart */
  get continuations() {
    return this.#view.continuations
  }

  /** The metrics each component reported so far: count, sum and last, by component and name */
  get metrics() {
    return this.#view.metrics
  }

  /**
   * A component's state at the run's moment.
   * @param {any} node  a node handle, its id, or its path in the run
   * @example run.state(db).tables.orders
   */
  state(node) {
    return this.#view.components[pathIn(node, Object.keys(this.#view.components))]
  }

  /** @param {string} action @param {object} [args] */
  async #control(action, args) {
    const sent = this.#sent
    this.#sent = []
    await Promise.all(sent)
    return this.#link.ask('run.control', { run: this.id, action, args })
  }

  /** @param {string} action @param {object} [args] */
  async #move(action, args) {
    this.#view = await this.#control(action, args)
    return this
  }

  /**
   * Starts or continues the run at its speed.
   * @example await run.play()
   */
  play() {
    return this.#move('play')
  }

  /**
   * Stops at the next event boundary; everything stays inspectable.
   * @example await run.pause()
   */
  pause() {
    return this.#move('pause')
  }

  /**
   * Ends the run, keeping its partial results.
   * @example await run.stop()
   */
  stop() {
    return this.#move('stop')
  }

  /**
   * A fresh run from time zero with the same scope, seed and requests, which this handle follows.
   * @example await run.restart()
   */
  async restart() {
    const before = this.id
    this.#link.track(await this.#control('restart'), this, before)
    return this
  }

  /**
   * Runs at full speed to the end of the load, or until a breakpoint.
   * @example await run.runToEnd()
   */
  runToEnd() {
    return this.#move('runToEnd')
  }

  /**
   * Steps n units forward: event, hop, followedHop, methodCall or time (spec §12 "Step units").
   * @param {number} n @param {string} unit
   * @param {{ sliceMs?: number }} [options]  time steps' slice, 10 ms by default
   * @example await run.stepForward(5, 'hop')
   */
  stepForward(n, unit, options = {}) {
    return this.#move('step', { n: n ?? 1, unit: UNITS[unit] ?? unit ?? 'event', ...options })
  }

  /**
   * Steps n units back, restoring the exact earlier state.
   * @param {number} n @param {string} unit
   * @param {{ sliceMs?: number }} [options]
   * @example await run.stepBack(3, 'followedHop')
   */
  stepBack(n, unit, options = {}) {
    return this.stepForward(-(n ?? 1), unit, options)
  }

  /**
   * Enters the next private call or expanded composite in the followed request.
   * @example await run.stepInto()
   */
  stepInto() {
    return this.#move('stepInto')
  }

  /**
   * Runs the frame's call to its end and moves to the call that made it.
   * @example await run.stepOut()
   */
  stepOut() {
    return this.#move('stepOut')
  }

  /**
   * Moves to a moment, as the scrubber does: `{ event }` or `{ timeMs }`.
   * @param {{ event?: number, timeMs?: number }} moment
   * @example await run.seek({ timeMs: 250 })
   */
  seek(moment) {
    return this.#move('seek', momentOf(moment))
  }

  /**
   * Plays faster or slower, from 0.1 to Infinity; never changes results.
   * @param {number} speed
   * @example await run.setSpeed(4)
   */
  setSpeed(speed) {
    return this.#move('setSpeed', { speed })
  }

  /**
   * Follows a request by its trace id, for followed hops and stepping into calls.
   * @param {string} trace
   * @example await run.follow((await run.spans())[0].traceId)
   */
  follow(trace) {
    return this.#move('follow', { trace })
  }

  /**
   * Changes the paused run only. The change is `{ props }` in canonical units, or
   * `{ state: { path, value } }`, and reaches the run ahead of the next control (spec §12
   * "Editing a paused run").
   * @param {any} node  a node handle, its id, or its path
   * @param {{ props?: Record<string, unknown>, state?: { path: (string|number)[], value: unknown } }} change
   * @example run.edit(db, { props: { maxConnections: 200 } })
   */
  edit(node, change) {
    if (this.status !== 'paused')
      throw new StrataError(
        'E_RUN_STATE',
        `A run is edited while paused; this one is ${this.status}`
      )
    const at = pathIn(node, Object.keys(this.#view.components))
    const edit = change?.props
      ? { kind: 'props', node: at, props: change.props }
      : change?.state
        ? { kind: 'state', node: at, path: change.state.path, value: change.state.value }
        : fail('INVALID', 'A run-only edit is { props } or { state: { path, value } }')
    const sent = this.#link
      .ask('run.control', { run: this.id, action: 'edit', args: { edit } })
      .then(view => void (this.#view = view))
    sent.catch(() => {})
    this.#sent.push(sent)
    return this
  }

  /**
   * Continues from now with the property and state edits in effect.
   * @example await run.resume()
   */
  resume() {
    return this.#move('resume')
  }

  /**
   * A branch run from this moment with the edits, which plays on; this run stays here.
   * @example const branch = await run.replayFromHere()
   */
  async replayFromHere() {
    return this.#link.track(await this.#control('replayFromHere'))
  }

  /**
   * A new run from time zero with the same seed and every edit so far, as a branch.
   * @example const again = await run.restartWithChanges()
   */
  async restartWithChanges() {
    return this.#link.track(await this.#control('restartWithChanges'))
  }

  /**
   * Makes the run-only property edits model changes, as one undoable change. State, code and
   * structure edits have no place in the model and come back as not kept.
   * @example const { notKept } = await run.keepInModel()
   */
  async keepInModel() {
    const { result, ...view } = await this.#control('keepInModel')
    this.#view = view
    this.#link.keep(result.commands)
    return result
  }

  /**
   * Drops the run-only edits.
   * @example await run.discard()
   */
  discard() {
    return this.#move('discard')
  }

  /**
   * Pauses before a message arrives at a component. It takes `{ node, method }`, or a debugger
   * breakpoint (strata.debug.setBreakpoint), and the next move goes past it.
   * @param {{ node?: any, [key: string]: unknown }} spec
   * @example await run.setBreakpoint({ node: db, method: 'insert' })
   */
  setBreakpoint(spec) {
    const node = spec.node && pathIn(spec.node, Object.keys(this.#view.components))
    return this.#move('setBreakpoint', node ? { ...spec, node } : spec)
  }

  /**
   * Removes every breakpoint.
   * @example await run.clearBreakpoints()
   */
  clearBreakpoints() {
    return this.#move('clearBreakpoints')
  }

  /** @param {string} what @param {object} [args] */
  [READ](what, args) {
    return this.#link.ask('run.read', { run: this.id, what, args })
  }

  /**
   * Fetches the latest view, after the frame being played.
   * @example await run.refresh()
   */
  async refresh() {
    this.#view = await this[READ]('view')
    return this
  }

  /**
   * The trace so far: every span, as Jaeger-style records.
   * @example (await run.spans()).filter(s => s.status === 'error')
   */
  spans() {
    return this[READ]('spans')
  }

  /**
   * What components logged so far.
   * @example await run.logs()
   */
  logs() {
    return this[READ]('logs')
  }

  /**
   * The hash of everything the run's moment holds.
   * @example await run.hash()
   */
  hash() {
    return this[READ]('hash')
  }

  /**
   * Drops the run and its branches from the worker.
   * @example await run.close()
   */
  async close() {
    await this.#link.ask('run.close', { run: this.id })
    this.#link.forget(this)
  }

  /**
   * Names the run, its state and its moment.
   * @example String(run)
   */
  toString() {
    const { event, timeUs } = this.#view.position
    return `Run<${this.id} ${this.status} at event ${event}, ${timeUs / 1000} ms>`
  }

  [INSPECT]() {
    return this.toString()
  }
}
