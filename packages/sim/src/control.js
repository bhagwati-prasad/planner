// @ts-check
/**
 * The run lifecycle and its controls (spec §12 "Run states", "Controls", task 0414). A control
 * holds a run and moves it through the states of the diagram: ready, playing, paused, finished
 * and stopped. Any other move fails with E_RUN_STATE. Playing advances simulated time on each
 * frame of the injected scheduler, by the frame's length times the speed, so speed changes how
 * fast a run goes and never what it does. A run finishes when no event is left, or when it
 * reaches its duration. Breakpoints are checked before each event is handled (spec §13).
 * Following a request gives a frame, the call the debugger is in, which step into and step out
 * move into private calls and expanded composites and out of them.
 */
import { StrataError, fail } from '../../core/src/index.js'
import { createRun } from './run.js'

/**
 * @typedef {'ready'|'playing'|'paused'|'finished'|'stopped'} RunState
 * @typedef {{ setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (id: any) => void }} Scheduler
 * @typedef {{ node: string, method?: string }} Breakpoint  a message arriving at a component, for
 *   one of its methods or any
 */

/** Slowest and fastest speeds; Infinity runs each frame to the end or a breakpoint. */
const SPEEDS = [0.1, Infinity]

/** A component's depth in the model: how many composites it is inside, plus one. @param {string} id */
const depth = id => id.split('/').length

export class RunControl {
  /** @type {RunState} */
  #state = 'ready'
  /** @type {import('./run.js').Run} */
  #run
  #input
  #scheduler
  #durationUs
  #frameMs
  #speed
  /** @type {unknown} */
  #timer = null
  /** @type {Promise<unknown>} */
  #busy = Promise.resolve()
  /** @type {Breakpoint[]} */
  #breakpoints = []
  /** The event a breakpoint paused before, which the next move goes past. */
  #pausedBefore = -1
  /** @type {Parameters<import('./run.js').Run['inject']>[0][]} requests injected before the run started, which restart injects again */
  #injected = []
  /** @type {string|null} */
  #trace = null
  /** @type {import('./run.js').Span|null} */
  #frame = null

  /**
   * @param {import('./run.js').RunInput} input
   * @param {{ scheduler: Scheduler, durationMs?: number, frameMs?: number, speed?: number }} options
   */
  constructor(input, { scheduler, durationMs = 60_000, frameMs = 16, speed = 1 }) {
    this.#input = input
    this.#scheduler = scheduler
    this.#durationUs = Math.round(durationMs * 1000)
    this.#frameMs = frameMs
    this.#speed = 1
    this.setSpeed(speed)
    this.#run = createRun(input)
  }

  /** The state of the run (spec §12). */
  get state() {
    return this.#state
  }

  /** The run: its trace, metrics and state, kept after it stops. */
  get run() {
    return this.#run
  }

  /** The call the debugger is in, in the followed request; null when none is followed. */
  get frame() {
    return this.#frame
  }

  /** Waits until the frame being played, if any, has been handled. */
  idle() {
    return this.#busy
  }

  /**
   * Sends a request into the run when it starts; a restart sends it again.
   * @param {Parameters<import('./run.js').Run['inject']>[0]} request
   */
  inject(request) {
    this.#expect('inject', ['ready'])
    this.#injected.push(request)
    return this.#run.inject(request)
  }

  /** Starts or continues the run at the chosen speed. */
  async play() {
    this.#expect('play', ['ready', 'paused'])
    this.#state = 'playing'
    this.#next()
  }

  /** Stops at the next event boundary, where everything stays inspectable. */
  async pause() {
    this.#expect('pause', ['playing'])
    await this.#halt('paused')
  }

  /** Ends the run, keeping its partial results. */
  async stop() {
    this.#expect('stop', ['playing', 'paused'])
    await this.#halt('stopped')
  }

  /** A fresh run from time zero, with the same input and seed, and the requests injected before. */
  async restart() {
    this.#expect('restart', ['finished', 'stopped'])
    this.#run = createRun(this.#input)
    for (const request of this.#injected) this.#run.inject(request)
    this.#pausedBefore = -1
    this.#frame = null
    this.#state = 'ready'
  }

  /** Runs at full speed until the load completes, or a breakpoint pauses it. */
  async runToEnd() {
    this.#expect('runToEnd', ['paused'])
    const why = await this.#advance({ untilUs: this.#durationUs })
    this.#state = why === 'before' ? 'paused' : 'finished'
  }

  /**
   * Steps n units forward, or back for a negative n, then pauses (spec §12 "Step units").
   * @param {number} n @param {Parameters<import('./run.js').Run['step']>[1]} [unit]
   * @param {{ sliceMs?: number }} [options]
   */
  async step(n, unit = 'event', options = {}) {
    await this.#stepping('step')
    await this.#run.step(n, unit, { trace: this.#trace ?? undefined, ...options })
    this.#refocus()
  }

  /**
   * Moves to a moment, as the scrubber does.
   * @param {{ event?: number, timeUs?: number }} target
   */
  async seek(target) {
    this.#expect('seek', ['paused'])
    await this.#run.seek(target)
    this.#refocus()
  }

  /** Enters the next private call or expanded composite inside the frame, in the followed request. */
  async stepInto() {
    await this.#stepping('stepInto')
    const trace = this.#following('stepInto')
    const frame = this.#frame
    const spans = this.#run.spans
    const ids = new Map(spans.map(s => [s.spanId, s]))
    /** Whether a span is inside the frame. @param {import('./run.js').Span} span */
    const within = span => {
      if (!frame) return true
      for (let at = ids.get(span.parentSpanId ?? ''); at; at = ids.get(at.parentSpanId ?? ''))
        if (at === frame) return true
      return false
    }
    /** @param {import('./run.js').Span} span */
    const enters = span =>
      span.traceId === trace &&
      (span.kind === 'private' ||
        (span.kind === 'public' && (!frame || depth(span.node) > depth(frame.node)))) &&
      within(span)
    let seen = spans.length
    /** @type {import('./run.js').Span|null} */
    let entered = null
    await this.#advance({
      until: () => {
        for (; seen < spans.length; seen++) {
          ids.set(spans[seen].spanId, spans[seen])
          if (!entered && enters(spans[seen])) entered = spans[seen]
        }
        return entered !== null || (frame !== null && frame.status !== 'running')
      },
    })
    this.#frame = entered ?? (frame && this.#caller(frame))
  }

  /** Runs the frame's call to its end, and moves the frame to the call that made it. */
  async stepOut() {
    await this.#stepping('stepOut')
    this.#following('stepOut')
    const frame = this.#frame ?? fail('INVALID', 'There is no call to step out of')
    if (frame.status === 'running') await this.#advance({ until: () => frame.status !== 'running' })
    this.#frame = this.#caller(frame)
  }

  /**
   * Sets how fast the run plays: 0.1 to Infinity, which runs each frame to the end. It changes
   * how fast simulated time passes, never what happens.
   * @param {number} speed
   */
  setSpeed(speed) {
    if (!(speed >= SPEEDS[0] && speed <= SPEEDS[1]))
      fail('INVALID', `Speed is from ${SPEEDS[0]} to Infinity, not ${speed}`)
    this.#speed = speed
  }

  /** Follows a request by its trace id, or no request. @param {string|null} trace */
  follow(trace) {
    this.#trace = trace
    this.#refocus()
  }

  /** Pauses before a message arrives at a component, for a method or any. @param {Breakpoint} breakpoint */
  setBreakpoint(breakpoint) {
    this.#breakpoints.push(breakpoint)
  }

  clearBreakpoints() {
    this.#breakpoints = []
  }

  /** @param {string} action @param {RunState[]} from */
  #expect(action, from) {
    if (!from.includes(this.#state))
      throw new StrataError(
        'E_RUN_STATE',
        `A ${this.#state} run cannot ${action}; it can from ${from.join(' or ')}`,
        { state: this.#state, action }
      )
  }

  /** A step may start playing or paused, and pauses. @param {string} action */
  async #stepping(action) {
    this.#expect(action, ['playing', 'paused'])
    if (this.#state === 'playing') await this.#halt('paused')
  }

  /** The trace being followed. @param {string} action */
  #following(action) {
    return this.#trace ?? fail('INVALID', `${action} follows a request; follow one first`)
  }

  /** Stops playing at the next event boundary, in a new state. @param {RunState} state */
  async #halt(state) {
    if (this.#timer !== null) this.#scheduler.clearTimeout(this.#timer)
    this.#timer = null
    this.#state = state
    await this.#busy
  }

  /** Plays the next frame on the scheduler. */
  #next() {
    this.#timer = this.#scheduler.setTimeout(() => {
      this.#timer = null
      this.#busy = this.#frameOnce()
    }, this.#frameMs)
  }

  /** Plays one frame: the frame's length times the speed of simulated time. */
  async #frameOnce() {
    const target = this.#run.position.timeUs + this.#speed * this.#frameMs * 1000
    const why = await this.#advance({
      untilUs: Math.min(this.#durationUs, Math.round(target)),
      until: () => this.#state !== 'playing',
    })
    if (this.#state !== 'playing') return
    if (why === 'before') this.#state = 'paused'
    else if (why === 'end' || this.#run.position.timeUs >= this.#durationUs)
      this.#state = 'finished'
    else this.#next()
  }

  /**
   * Moves the run on, pausing before a message a breakpoint matches, but never before the one a
   * breakpoint paused it before.
   * @param {Parameters<import('./run.js').Run['advance']>[0]} limits
   */
  async #advance(limits) {
    const why = await this.#run.advance({
      ...limits,
      before: event => this.#run.position.event !== this.#pausedBefore && this.#breaks(event),
    })
    this.#pausedBefore = why === 'before' ? this.#run.position.event : -1
    this.#refocus()
    return why
  }

  /** Whether a breakpoint matches an event. @param {any} event */
  #breaks(event) {
    if (event?.type !== 'deliver' || event.message.kind === 'response') return false
    const { to, method } = event.message
    return this.#breakpoints.some(
      b => b.node === to.node && (b.method === undefined || b.method === method)
    )
  }

  /** The nearest call above a span: the call it was made in, or the one that sent it. @param {import('./run.js').Span} span */
  #caller(span) {
    const spans = this.#run.spans
    let parent = span.parentSpanId
    while (parent) {
      const found = spans.find(s => s.spanId === parent)
      if (!found) return null
      if (found.kind === 'public' || found.kind === 'private') return found
      parent = found.parentSpanId
    }
    return null
  }

  /** Keeps the frame in the run as it is now: the latest running call of the followed request. */
  #refocus() {
    if (!this.#trace) return void (this.#frame = null)
    if (this.#frame && this.#run.spans.includes(this.#frame)) return
    const calls = this.#run.spans.filter(
      s => s.traceId === this.#trace && (s.kind === 'public' || s.kind === 'private')
    )
    let running = null
    for (const s of calls) if (s.status === 'running') running = s
    this.#frame = running ?? calls.at(-1) ?? null
  }
}

/**
 * A run with its controls (spec §12).
 * @param {import('./run.js').RunInput} input
 * @param {{ scheduler: Scheduler, durationMs?: number, frameMs?: number, speed?: number }} options
 *   the scheduler that paces playing, the run's duration (60 s by default), the frame length
 *   (16 ms) and the speed (1)
 * @example const control = createControl({ seed: 1, nodes, edges }, { scheduler: { setTimeout, clearTimeout } })
 */
export function createControl(input, options) {
  return new RunControl(input, options)
}
