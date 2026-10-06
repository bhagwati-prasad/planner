// @ts-check
/**
 * Run sessions (ADR 0025, task 0417): the runs a worker keeps between messages, by id, so the
 * page can drive each with every control of spec §12. The worker's session and the in-process
 * host answer the same messages through this:
 *
 *   → run.start   { input, durationMs, frameMs, speed }   a planned run (core's planModel) and
 *                                                         the requests it is given (`inject`)
 *   ← run.view    View
 *   → run.control { run, action, args }                   one control; the reply is the view of
 *                                                         the moment it left the run at
 *   ← run.view    View, with `result` for keepInModel
 *   → run.read    { run, what, args }                     view, spans, metrics, logs, changes,
 *                                                         hash, runs or compare
 *   ← run.data    { chunk, of, data }                     at most 64 KB a chunk (eng §13)
 *   ← run.view    View, id null                           while playing, at most every 100 ms
 *                                                         of wall time, and when it stops
 *   ← heartbeat   { run }                                 every 250 ms of wall time inside a
 *                                                         long action, for the watchdog
 *   → run.close   { run }                                 drops the run and its branches
 *   ← run.closed  { run }
 *
 * Each run in a control's run tree has its own id, the session's and the tree's together, such
 * as `s1.run-2`. Only the control's current run moves: one that went on as a branch, or was
 * restarted, keeps the moment it was left at, to read and compare. Messages are handled one at a
 * time, in the order they came.
 */
import {
  SIM_PROTOCOL_VERSION as PROTOCOL_VERSION,
  StrataError,
  fail,
} from '../../core/src/index.js'
import { compareRuns, metricTotals } from './compare.js'
import { createControl } from './control.js'
import { withBehaviours } from './behaviours.js'

/**
 * @typedef {import('./protocol.js').ProtocolMessage} ProtocolMessage
 * @typedef {import('./control.js').RunControl} RunControl
 * @typedef {import('./control.js').Scheduler} Scheduler
 *
 * @typedef {object} Session  one control and the runs of its tree
 * @property {string} id
 * @property {RunControl} control
 * @property {number} speed
 * @property {Map<string, string>} left  the state each run that is no longer current was left in
 * @property {number} viewed  the wall time of the last view posted while playing
 *
 * @typedef {object} SessionOptions
 * @property {(manifest: any) => object|undefined} behaviourOf  a component's behaviour, by its
 *   manifest; a component without one runs its base type's (spec §8)
 * @property {Scheduler} scheduler  plays the frames of playing runs
 * @property {() => number} wallMs  wall time in ms, for heartbeats and views while playing
 * @property {(message: ProtocolMessage) => void} post  posts what no request asked for
 * @property {number} [chunkBytes]  the most a read's chunk may hold (eng §13: 64 KB)
 * @property {Extensions} [extensions]  more controls and reads, such as strata-debug's
 *
 * Controls and reads a package above strata-sim adds to the run sessions (task 0429): each
 * control takes the run's control and its arguments, and each read takes the run as it is at
 * its own moment, `{ run, following }`, and its arguments.
 * @typedef {object} Extensions
 * @property {Record<string, (control: RunControl, args: any) => unknown>} [actions]
 * @property {Record<string, (at: any, args: any) => unknown>} [reads]
 */

/** A long action posts a heartbeat this often, in ms of wall time (spec §8 "Watchdog"). */
export const HEARTBEAT_MS = 250
/** A playing run posts its view at most this often, in ms of wall time (eng §13 "Streaming"). */
export const VIEW_MS = 100

/** Controls that start a new run in the tree, whose view is the reply. */
const NEW_RUN = new Set(['restart', 'replayFromHere', 'restartWithChanges'])

/**
 * Readies a run for a move that needs it paused: a ready run plays and pauses at once, and a
 * playing one pauses, both moves of spec §12's diagram, in one task, so no frame plays between.
 * @param {RunControl} c
 */
async function paused(c) {
  if (c.state === 'ready') await c.play()
  if (c.state === 'playing') await c.pause()
}

/**
 * Each control, from its arguments. Stepping, seeking and running to the end go from a ready or
 * playing run too, by pausing it first.
 * @type {Record<string, (control: RunControl, args: any, session: Session) => unknown>}
 */
const ACTIONS = {
  play: c => c.play(),
  pause: c => c.pause(),
  stop: c => c.stop(),
  restart: c => c.restart(),
  runToEnd: async c => {
    await paused(c)
    return c.runToEnd()
  },
  step: async (c, { n = 1, unit = 'event', sliceMs } = {}) => {
    await paused(c)
    // Following nothing, followed hops follow the first request.
    if (unit === 'followed' && !c.following) {
      const first = c.run.spans.find(s => s.kind === 'public')
      if (first) c.follow(first.traceId)
    }
    return c.step(n, unit, sliceMs === undefined ? {} : { sliceMs })
  },
  seek: async (c, moment) => {
    await paused(c)
    return c.seek(moment)
  },
  setSpeed: (c, { speed }, s) => {
    c.setSpeed(speed)
    s.speed = speed
  },
  follow: (c, { trace }) => c.follow(trace),
  stepInto: async c => {
    await paused(c)
    return c.stepInto()
  },
  stepOut: async c => {
    await paused(c)
    return c.stepOut()
  },
  edit: (c, { edit }) => c.edit(edit),
  resume: c => c.resume(),
  replayFromHere: c => c.replayFromHere(),
  restartWithChanges: c => c.restartWithChanges(),
  keepInModel: c => c.keepInModel(),
  discard: c => c.discard(),
  setBreakpoint: (c, breakpoint) => c.setBreakpoint(breakpoint),
  clearBreakpoints: c => c.clearBreakpoints(),
}

/**
 * Splits an array into parts of at most `bytes` of JSON each; anything else is one part.
 * @param {unknown} data @param {number} bytes
 * @returns {unknown[]}
 */
function chunked(data, bytes) {
  if (!Array.isArray(data) || bytes === Infinity) return [data]
  /** @type {unknown[][]} */
  const parts = [[]]
  let size = 2
  for (const item of data) {
    const n = JSON.stringify(item).length + 1
    if (parts[parts.length - 1].length && size + n > bytes) {
      parts.push([])
      size = 2
    }
    parts[parts.length - 1].push(item)
    size += n
  }
  return parts
}

/**
 * The runs of a worker, or of the in-process host.
 * @param {SessionOptions} options
 */
export function createRunSessions({
  behaviourOf,
  scheduler,
  wallMs,
  post,
  chunkBytes = 64_000,
  extensions = {},
}) {
  /** @type {Record<string, (control: RunControl, args: any, session: Session) => unknown>} */
  const actions = { ...ACTIONS, ...extensions.actions }
  /** @type {Map<string, { session: Session, tree: string }>} */
  const runs = new Map()
  let count = 0
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve()

  /** @param {Session} s @param {string} tree */
  const idOf = (s, tree) => `${s.id}.${tree}`

  /** @param {string} run */
  const find = run =>
    runs.get(run) ??
    fail(
      'E_RUN_NOT_FOUND',
      `No run '${run}' in this worker: it was closed, or its worker restarted`
    )

  /**
   * What the page sees of a run at the moment it is at (ADR 0025).
   * @param {Session} s @param {string} tree
   */
  function view(s, tree) {
    const { control } = s
    const node = /** @type {import('./control.js').TreeRun} */ (
      control.runs.find(r => r.id === tree)
    )
    const current = control.current.id === tree
    const { run } = node
    const frame = current ? control.frame : null
    return {
      run: idOf(s, tree),
      status: current ? control.state : (s.left.get(tree) ?? 'stopped'),
      current,
      position: run.position,
      speed: s.speed,
      following: current ? control.following : null,
      frame: frame && {
        spanId: frame.spanId,
        traceId: frame.traceId,
        node: frame.node,
        method: frame.method,
        kind: frame.kind,
        status: frame.status,
      },
      runs: control.runs.map(r => ({
        id: idOf(s, r.id),
        parent: r.parent && idOf(s, r.parent),
        branchPoint: r.branchPoint,
        edits: r.edits,
        seed: r.seed,
        hash: r.hash,
      })),
      edits: current ? control.edits : [],
      continuations: current && control.state === 'paused' ? control.continuations() : [],
      components: Object.fromEntries(run.components.map(c => [c, run.stateOf(c)])),
      metrics: metricTotals(run),
    }
  }

  /** Posts a playing run's view after each frame, at most every VIEW_MS, and when it stops. @param {Session} s */
  function played(s) {
    const tree = s.control.current.id
    const now = wallMs()
    if (s.control.state === 'playing' && now - s.viewed < VIEW_MS) return
    s.viewed = now
    post({ v: PROTOCOL_VERSION, type: 'run.view', id: null, payload: view(s, tree) })
  }

  /** @param {ProtocolMessage['id']} id @param {{ input: any, durationMs?: number, frameMs?: number, speed?: number }} payload */
  function start(id, { input, durationMs, frameMs, speed = 1 }) {
    const { inject = [], ...rest } = input
    const { nodes, edges } = withBehaviours(rest, behaviourOf)
    /** @type {Session} */
    const s = /** @type {any} */ ({ id: `s${++count}`, speed, left: new Map(), viewed: 0 })
    // Each frame of a playing run ends with its view.
    /** @type {Scheduler} */
    const frames = {
      setTimeout: (fn, ms) =>
        scheduler.setTimeout(() => {
          fn()
          void s.control.idle().then(() => played(s))
        }, ms),
      clearTimeout: timer => scheduler.clearTimeout(timer),
    }
    s.control = createControl(
      { ...rest, nodes, edges },
      { scheduler: frames, durationMs, frameMs, speed }
    )
    for (const request of inject) s.control.inject(request)
    runs.set(idOf(s, s.control.current.id), { session: s, tree: s.control.current.id })
    return reply(id, 'run.view', view(s, s.control.current.id))
  }

  /** @param {ProtocolMessage['id']} id @param {{ run: string, action: string, args?: any }} payload */
  async function control(id, { run, action, args }) {
    const { session: s, tree } = find(run)
    const act = actions[action] ?? fail('INVALID', `Runs have no control '${action}'`)
    if (s.control.current.id !== tree)
      throw new StrataError(
        'E_RUN_STATE',
        `Run '${run}' went on as '${idOf(s, s.control.current.id)}', which is the one to control`,
        { run, current: idOf(s, s.control.current.id) }
      )
    const left = s.control.state
    let beat = wallMs()
    const quiet = s.control.run.observe(() => {
      const now = wallMs()
      if (now - beat < HEARTBEAT_MS) return
      beat = now
      post({ v: PROTOCOL_VERSION, type: 'heartbeat', id, payload: { run } })
    })
    let result
    try {
      result = await act(s.control, args, s)
    } finally {
      quiet()
    }
    const now = s.control.current.id
    if (now !== tree) {
      s.left.set(tree, left === 'paused' && action === 'restartWithChanges' ? 'stopped' : left)
      runs.set(idOf(s, now), { session: s, tree: now })
    }
    const shown = view(s, NEW_RUN.has(action) ? now : tree)
    return reply(id, 'run.view', action === 'keepInModel' ? { ...shown, result } : shown)
  }

  /** @param {ProtocolMessage['id']} id @param {{ run: string, what: string, args?: any }} payload */
  async function read(id, { run, what, args = {} }) {
    const { session: s, tree } = find(run)
    await s.control.idle()
    const it = /** @type {import('./control.js').TreeRun} */ (
      s.control.runs.find(r => r.id === tree)
    ).run
    /** @type {Record<string, () => unknown>} */
    const reads = {
      view: () => view(s, tree),
      spans: () => it.spans,
      metrics: () => it.metrics,
      logs: () => it.logs,
      changes: () => it.changes,
      hash: () => it.stateHash(),
      runs: () => view(s, tree).runs,
      compare: () => {
        const other = find(args.other)
        const b = /** @type {import('./control.js').TreeRun} */ (
          other.session.control.runs.find(r => r.id === other.tree)
        ).run
        return compareRuns(it, b, args.moment)
      },
    }
    const more = extensions.reads?.[what]
    // An extension reads the run as it is at its own moment, followed trace included.
    const at = { run: it, following: s.control.current.id === tree ? s.control.following : null }
    const data = await (
      reads[what] ??
      (more && (() => more(at, args))) ??
      (() => fail('INVALID', `Runs have nothing to read as '${what}'`))
    )()
    const parts = chunked(data, chunkBytes)
    return parts.map((part, chunk) =>
      reply(id, 'run.data', { chunk, of: parts.length, data: part })
    )
  }

  /** @param {ProtocolMessage['id']} id @param {{ run: string }} payload */
  async function close(id, { run }) {
    const { session: s } = find(run)
    if (['playing', 'paused'].includes(s.control.state)) await s.control.stop()
    for (const [key, entry] of runs) if (entry.session === s) runs.delete(key)
    return reply(id, 'run.closed', { run })
  }

  /** @param {ProtocolMessage['id']} id @param {string} type @param {unknown} payload @returns {ProtocolMessage} */
  function reply(id, type, payload) {
    return { v: PROTOCOL_VERSION, type, id, payload }
  }

  /** @type {Record<string, (id: ProtocolMessage['id'], payload: any) => unknown>} */
  const handlers = {
    'run.start': start,
    'run.control': control,
    'run.read': read,
    'run.close': close,
  }

  return {
    /** Whether a message is one of the run sessions'. @param {ProtocolMessage} message */
    handles: message => message?.type in handlers,
    /**
     * Answers one run message, after those that came before it, with its replies: one, or a
     * read's chunks. Failures reject with their StrataError.
     * @param {ProtocolMessage} message
     * @returns {Promise<ProtocolMessage[]>}
     */
    handle(message) {
      const done = queue.then(async () => {
        const out = await handlers[message.type](message.id, message.payload ?? {})
        return /** @type {ProtocolMessage[]} */ (Array.isArray(out) ? out : [out])
      })
      queue = done.catch(() => {})
      return done
    },
  }
}
