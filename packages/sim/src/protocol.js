// @ts-check
/**
 * The worker protocol (eng §13 "Worker protocol"): every message is `{ v, type, id, payload }`,
 * where `v` is the protocol version and `id` pairs a reply with its request. The worker's
 * session (worker/session.js) adds `load`, `call` and the heartbeat.
 *
 *   → { v: 1, type: 'run', id, payload: RunInput }
 *   ← { v: 1, type: 'run.result', id, payload: RunResult }
 *   ← { v: 1, type: 'error', id, payload: { code, message } }
 */
import { simulate } from './skeleton.js'

export const PROTOCOL_VERSION = 1

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
