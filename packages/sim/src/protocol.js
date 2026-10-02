// @ts-check
/**
 * The worker protocol (eng §13 "Worker protocol"): every message is `{ v, type, id, payload }`,
 * where `v` is the protocol version and `id` pairs a reply with its request. The worker's
 * session (worker/session.js) adds `load`, `call` and the heartbeat, and the run sessions
 * (sessions.js, ADR 0025) `run.start`, `run.control`, `run.read` and `run.close`.
 *
 *   → { v: 1, type: 'run', id, payload: RunInput }
 *   ← { v: 1, type: 'run.result', id, payload: RunResult }
 *   ← { v: 1, type: 'error', id, payload: { code, message } }
 */
import { SIM_PROTOCOL_VERSION, fail } from '../../core/src/index.js'
import { createRunSessions } from './sessions.js'
import { simulate } from './skeleton.js'

export const PROTOCOL_VERSION = SIM_PROTOCOL_VERSION

/**
 * @typedef {{ v: number, type: string, id: string|number|null, payload?: any }} ProtocolMessage
 */

/**
 * The buffers of the typed arrays and ArrayBuffers inside a value, to move instead of copy when
 * posting it (eng §13 "Large arrays travel as Transferables").
 * @param {unknown} value
 * @returns {ArrayBuffer[]}
 */
export function transferables(value) {
  /** @type {Set<ArrayBuffer>} */
  const buffers = new Set()
  const seen = new Set()
  /** @param {unknown} v */
  const visit = v => {
    if (typeof v !== 'object' || v === null || seen.has(v)) return
    seen.add(v)
    if (v instanceof ArrayBuffer) buffers.add(v)
    else if (ArrayBuffer.isView(v)) {
      if (v.buffer instanceof ArrayBuffer) buffers.add(v.buffer)
    } else for (const item of Object.values(v)) visit(item)
  }
  visit(value)
  return [...buffers]
}

/**
 * @param {ProtocolMessage['id']} id
 * @param {string} code
 * @param {string} message
 * @returns {ProtocolMessage}
 */
const errorReply = (id, code, message) => ({
  v: PROTOCOL_VERSION,
  type: 'error',
  id,
  payload: { code, message },
})

/**
 * Answers one request. Never throws: failures become `error` replies with a code.
 * @param {ProtocolMessage} message
 * @returns {ProtocolMessage}
 */
export function handleMessage(message) {
  const { v, type, id = null, payload } = message ?? {}
  if (v !== PROTOCOL_VERSION)
    return errorReply(
      id,
      'E_PROTOCOL_VERSION',
      `Protocol version ${v} is not supported (expected ${PROTOCOL_VERSION})`
    )
  if (type !== 'run')
    return errorReply(id, 'E_PROTOCOL_UNKNOWN_TYPE', `Unknown message type '${type}'`)
  try {
    return { v: PROTOCOL_VERSION, type: 'run.result', id, payload: simulate(payload) }
  } catch (err) {
    return errorReply(id, err.code ?? 'INVALID', String(err.message ?? err))
  }
}

/** A scheduler for an in-process host given none: playing a run needs one. */
const NO_SCHEDULER = {
  setTimeout: () =>
    fail(
      'INVALID',
      'Playing a run in process needs a scheduler: createInProcessSimHost({ scheduler })'
    ),
  clearTimeout: () => {},
}

/**
 * A simulation host that runs the kernel in the calling thread, for Node scripts and tests
 * (`createStrata({ simHost: createInProcessSimHost({ behaviours, scheduler }) })`). It answers the
 * same messages as the worker, run sessions included (ADR 0025), and copies each message both
 * ways, as posting to a worker does. It has no sandbox and no watchdog, and it evaluates no code:
 * `load` loads nothing, and runs take their behaviours from `behaviours`, by `id@version` or id.
 * @param {object} [options]
 * @param {Record<string, object>} [options.behaviours]  behaviour modules by component type
 * @param {import('./control.js').Scheduler} [options.scheduler]  plays runs
 * @param {() => number} [options.wallMs]  wall time, for views while playing
 * @example createStrata({ simHost: createInProcessSimHost({ behaviours: { 'acme.queue': queue }, scheduler }) })
 */
export function createInProcessSimHost({ behaviours = {}, scheduler, wallMs = () => 0 } = {}) {
  /** @type {Set<(message: ProtocolMessage) => void>} */
  const listeners = new Set()
  const runs = createRunSessions({
    behaviourOf: m => behaviours[`${m.id}@${m.version}`] ?? behaviours[m.id],
    scheduler: scheduler ?? NO_SCHEDULER,
    wallMs,
    post: message => {
      for (const listener of listeners) listener(structuredClone(message))
    },
    chunkBytes: Infinity,
  })
  return {
    /** @param {ProtocolMessage} message @returns {Promise<ProtocolMessage>} */
    async request(message) {
      const { v, type, id = null } = message ?? {}
      if (v === PROTOCOL_VERSION && type === 'load')
        return { v, type: 'load.result', id, payload: { components: [] } }
      if (v !== PROTOCOL_VERSION || !runs.handles(message)) return handleMessage(message)
      try {
        const replies = await runs.handle(structuredClone(message))
        return structuredClone(/** @type {ProtocolMessage} */ (replies.at(-1)))
      } catch (err) {
        const e = /** @type {any} */ (err)
        return errorReply(id, e?.code ?? 'INVALID', String(e?.message ?? err))
      }
    },
    /**
     * Calls `listener` with each message no request asked for: views of playing runs.
     * @param {(message: ProtocolMessage) => void} listener
     */
    listen(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/**
 * A simulation host in the calling thread with no behaviours and no scheduler, for Node scripts
 * and tests that run the walking skeleton or base behaviours (`createStrata({ simHost:
 * inProcessSimHost })`).
 */
export const inProcessSimHost = Object.freeze(createInProcessSimHost())
