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
import { StrataError, canonicalJson, fail, sha256, toHex } from '../../core/src/index.js'
import { ENGINE_VERSION } from './kernel.js'
import { createRun } from './run.js'

/**
 * @typedef {'ready'|'playing'|'paused'|'finished'|'stopped'} RunState
 * @typedef {{ setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (id: any) => void }} Scheduler
 * @typedef {{ node: string, method?: string } | { when: (happening: import('./run.js').Happening) => boolean }} Breakpoint
 *   a message arriving at a component, for one of its methods or any; or anything that happens
 *   inside an event (spec §13), which pauses before that event
 * @typedef {import('./run.js').Edit} Edit
 * @typedef {{ event: number, timeUs: number }} Moment
 *
 * A run in the run tree (spec §12 "Run tree"): its parent and branch point, the edits made at
 * the branch point or since, its seed and its hash.
 * @typedef {object} TreeRun
 * @property {string} id
 * @property {string|null} parent
 * @property {Moment|null} branchPoint
 * @property {Edit[]} edits
 * @property {number} seed
 * @property {string} hash
 * @property {import('./run.js').Run} run
 *
 * @typedef {{ edit: Edit, at: Moment|null, kept: boolean }} RunOnlyEdit
 */

/** A value with each function replaced by its source, so code can be hashed. @param {unknown} value @returns {unknown} */
const describe = value =>
  typeof value === 'function'
    ? String(value)
    : Array.isArray(value)
      ? value.map(describe)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, describe(v)]))
        : value

/** @param {unknown} value */
const digest = value => toHex(sha256(canonicalJson(describe(value))))

/**
 * The hash of a run started from an input: the engine, the seed and the model, code included.
 * @param {import('./run.js').RunInput} input
 */
export function rootHash({ seed = 1, nodes, edges = [] }) {
  return digest({ engine: ENGINE_VERSION, seed, nodes, edges })
}

/**
 * The hash of a branch run (eng §13): over its parent's hash, its branch point and its edits, so
 * branches are as reproducible as fresh runs.
 * @param {{ parent: string, branchPoint: Moment, edits: Edit[] }} branch
 */
export function branchHash({ parent, branchPoint, edits }) {
  return digest({
    parent,
    branchPoint: { event: branchPoint.event, timeUs: branchPoint.timeUs },
    edits,
  })
}

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
  /** @type {TreeRun[]} */
  #runs = []
  /** @type {TreeRun} */
  #current
  /** @type {RunOnlyEdit[]} edits made and in the run, which are run-only until kept or discarded */
  #made = []
  /** @type {RunOnlyEdit[]} edits made while paused, waiting for a way to continue */
  #pending = []
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
    this.#current = this.#grow({
      parent: null,
      branchPoint: null,
      edits: [],
      hash: rootHash(input),
    })
  }

  /** Adds the current run to the tree. @param {Omit<TreeRun, 'id'|'seed'|'run'>} fields */
  #grow(fields) {
    /** @type {TreeRun} */
    const node = {
      id: `run-${this.#runs.length + 1}`,
      seed: this.#input.seed ?? 1,
      run: this.#run,
      ...fields,
    }
    this.#runs.push(node)
    return node
  }

  /** The runs, as a tree: each with its parent and branch point. */
  get runs() {
    return [...this.#runs]
  }

  /** The run being controlled, in the tree. */
  get current() {
    return this.#current
  }

  /**
   * The run-only edits: those in the run, with the moment they were made, and those waiting for
   * a way to continue, with none.
   */
  get edits() {
    return [...this.#made, ...this.#pending]
      .filter(e => !e.kept)
      .map(({ edit, at }) => ({ ...edit, at }))
  }

  /**
   * Edits the paused run, run-only (spec §12 "Editing a paused run"): property values, state,
   * behaviour code or structure. They take effect when it continues.
   * @param {Edit} edit
   */
  edit(edit) {
    this.#expect('edit', ['paused'])
    if (!['props', 'state', 'code', 'structure'].includes(edit?.kind))
      fail('INVALID', `Run-only edits are props, state, code and structure, not '${edit?.kind}'`)
    this.#pending.push({ edit, at: null, kept: false })
  }

  /**
   * The ways the run can continue with its edits: resume, for property and state changes;
   * replay from here, unless a component it removes has work on its way; and restart.
   * @returns {('resume'|'replay'|'restart')[]}
   */
  continuations() {
    const edits = this.#pending.map(p => p.edit)
    const resume = edits.every(e => e.kind === 'props' || e.kind === 'state')
    const replay = !edits.some(
      e => e.kind === 'structure' && (e.remove?.nodes ?? []).some(id => this.#run.hasWork(id))
    )
    return /** @type {('resume'|'replay'|'restart')[]} */ (
      [resume && 'resume', replay && 'replay', 'restart'].filter(Boolean)
    )
  }

  /** Continues from now with the property and state edits in effect from now on. */
  async resume() {
    this.#expect('resume', ['paused'])
    this.#continuing('resume')
    const at = { ...this.#run.position }
    for (const pending of this.#pending) {
      this.#run.applyEdit(pending.edit)
      this.#current.edits.push(pending.edit)
      this.#made.push({ ...pending, at })
    }
    this.#pending = []
    await this.play()
  }

  /**
   * A branch run (spec §12 "Run tree"): this moment's state, with the edits, which goes on
   * playing. It shares its parent's history up to here.
   * @returns {Promise<TreeRun>} the branch, now the current run
   */
  async replayFromHere() {
    this.#expect('replayFromHere', ['paused'])
    this.#continuing('replay')
    const branchPoint = { ...this.#run.position }
    const edits = this.#pending.map(p => p.edit)
    const child = await this.#run.fork()
    for (const edit of edits) child.applyEdit(edit)
    const parent = this.#current
    this.#run = child
    this.#current = this.#grow({
      parent: parent.id,
      branchPoint,
      edits,
      hash: branchHash({ parent: parent.hash, branchPoint, edits }),
    })
    for (const pending of this.#pending) this.#made.push({ ...pending, at: branchPoint })
    this.#pending = []
    this.#pausedBefore = -1
    this.#refocus()
    await this.play()
    return this.#current
  }

  /** A new run from time zero with the same seed and the edits made so far, ready to play. */
  async restartWithChanges() {
    this.#expect('restartWithChanges', ['paused', 'finished', 'stopped'])
    if (this.#state === 'paused') await this.#halt('stopped')
    const edits = [...this.#lineage().flatMap(r => r.edits), ...this.#pending.map(p => p.edit)]
    const parent = this.#current
    this.#run = createRun(this.#input)
    for (const request of this.#injected) this.#run.inject(request)
    for (const edit of edits) this.#run.applyEdit(edit)
    const branchPoint = { event: 0, timeUs: 0 }
    this.#current = this.#grow({
      parent: parent.id,
      branchPoint,
      edits,
      hash: branchHash({ parent: parent.hash, branchPoint, edits }),
    })
    for (const pending of this.#pending) this.#made.push({ ...pending, at: branchPoint })
    this.#pending = []
    this.#pausedBefore = -1
    this.#frame = null
    this.#state = 'ready'
  }

  /**
   * The run-only edits as model commands (spec §12): property values become `node.setProps`,
   * one for each component, for the facade to dispatch as one undoable change. State and code
   * have no place in the model, so those edits come back as not kept. Either way they are no
   * longer run-only.
   */
  keepInModel() {
    const open = [...this.#made, ...this.#pending].filter(e => !e.kept)
    /** @type {Map<string, Record<string, unknown>>} */
    const props = new Map()
    /** @type {Edit[]} */
    const notKept = []
    for (const { edit } of open) {
      if (edit.kind !== 'props') {
        notKept.push(edit)
        continue
      }
      const id = /** @type {string} */ (edit.node.split('/').at(-1))
      props.set(id, { ...props.get(id), ...edit.props })
    }
    for (const e of open) e.kept = true
    const commands = [...props].map(([id, values]) => ({
      type: 'node.setProps',
      payload: { id, props: values },
    }))
    return { commands, notKept }
  }

  /** Drops the run-only edits: those waiting go, and those made stay in the run only. */
  discard() {
    for (const e of this.#made) e.kept = true
    this.#pending = []
  }

  /** The current run and the runs above it, from the root. */
  #lineage() {
    /** @type {TreeRun[]} */
    const chain = []
    for (
      let r = /** @type {TreeRun|undefined} */ (this.#current);
      r;
      r = this.#runs.find(x => x.id === r?.parent)
    )
      chain.unshift(r)
    return chain
  }

  /** Fails when the edits waiting do not allow a way to continue. @param {'resume'|'replay'} how */
  #continuing(how) {
    if (!this.continuations().includes(how))
      throw new StrataError(
        'E_RUN_EDIT',
        how === 'resume'
          ? 'Code and structure edits cannot resume, since work on its way may depend on the old code or shape; replay from here or restart with changes'
          : 'A component the edits remove has work on its way, so the run cannot replay from here; restart with changes',
        { continuations: this.continuations() }
      )
  }

  /** The state of the run (spec §12). */
  get state() {
    return this.#state
  }

  /** The run: its trace, metrics and state, kept after it stops. */
  get run() {
    return this.#run
  }

  /** The trace of the request being followed, or null. */
  get following() {
    return this.#trace
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
    this.#current = this.#grow({
      parent: null,
      branchPoint: null,
      edits: [],
      hash: rootHash(this.#input),
    })
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

  /**
   * Pauses before a message arrives at a component, for a method or any; or, with `when`,
   * before the event in which something it holds for happens: a call starting, a message
   * arriving or leaving, a log. Such a call runs inside its event, so the run finds the event,
   * then steps back to just before it.
   * @param {Breakpoint} breakpoint
   */
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
    const watches = this.#breakpoints.flatMap(b => ('when' in b ? [b.when] : []))
    let hit = false
    const stop = watches.length
      ? this.#run.observe(happening => {
          // The event a breakpoint paused before runs this time.
          if (this.#run.position.event - 1 === this.#pausedBefore) return
          if (watches.some(when => when(happening))) hit = true
        })
      : () => {}
    let why
    try {
      why = await this.#run.advance({
        ...limits,
        until: () => hit || (limits.until?.() ?? false),
        before: event => this.#run.position.event !== this.#pausedBefore && this.#breaks(event),
      })
    } finally {
      stop()
    }
    if (hit) {
      // Back to just before the event the breakpoint holds for (ADR 0023: replay is exact).
      await this.#run.seek({ event: this.#run.position.event - 1 })
      why = 'before'
    }
    this.#pausedBefore = why === 'before' ? this.#run.position.event : -1
    this.#refocus()
    return why
  }

  /** Whether a breakpoint matches an event. @param {any} event */
  #breaks(event) {
    if (event?.type !== 'deliver' || event.message.kind === 'response') return false
    const { to, method } = event.message
    return this.#breakpoints.some(
      b => 'node' in b && b.node === to.node && (b.method === undefined || b.method === method)
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
