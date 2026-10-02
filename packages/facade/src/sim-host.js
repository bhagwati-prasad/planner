// @ts-check
/**
 * The page's side of the simulation worker (spec §8 "Sandbox", eng §13 "Worker protocol"): it
 * starts a worker through the `spawn` it is given (a Blob-URL Web Worker in the browser, a
 * `worker_threads` worker in Node), posts requests and pairs each reply with its request by `id`.
 * It refuses a worker that speaks another protocol version. Its watchdog stops a worker that is
 * silent for 2 s while requests wait, naming the method the worker's last heartbeat said it
 * started: a worker cannot be interrupted mid-function, so stopping it is the only hard stop.
 * A worker that stops is started again on the next request.
 *
 * It lives on the page's side, in the facade, so the main thread carries no simulation code:
 * strata-sim ships only in the worker bundle (ADR 0018).
 */
import { SIM_PROTOCOL_VERSION as PROTOCOL_VERSION, StrataError } from '../../core/src/index.js'

/**
 * @typedef {import('../../sim/src/protocol.js').ProtocolMessage} ProtocolMessage
 *
 * @typedef {object} SpawnedWorker
 * @property {(message: ProtocolMessage, transfer?: any[]) => void} post
 * @property {() => void} terminate
 *
 * @typedef {(handlers: { message: (data: any) => void, error: (err: Error) => void }) => SpawnedWorker} Spawn
 *
 * @typedef {object} SimHost
 * @property {(message: ProtocolMessage, transfer?: any[]) => Promise<ProtocolMessage>} request
 *   posts a request, moving the `transfer` buffers, and resolves with its reply; a read that
 *   comes in chunks resolves once, with every chunk's data together
 * @property {(listener: (message: ProtocolMessage) => void) => () => void} listen  calls the
 *   listener with each message no request asked for, such as a playing run's view
 * @property {() => void} terminate  stops the worker; requests still waiting are rejected
 */

/**
 * A host for `createStrata({ simHost })` that runs simulations in a worker it starts, and stops
 * one that stays silent for 2 s.
 * @param {object} options
 * @param {Spawn} options.spawn  starts a worker running the simulation worker bundle
 * @param {import('../../core/src/types.js').Scheduler} options.scheduler  runs the watchdog
 * @param {number} [options.silenceMs]  how long a busy worker may stay silent (spec §8: 2 s)
 * @returns {SimHost}
 * @example createSimHost({ spawn: spawnThreadWorker(source), scheduler: { setTimeout, clearTimeout } })
 */
export function createSimHost({ spawn, scheduler, silenceMs = 2000 }) {
  /** @type {SpawnedWorker|null} */
  let worker = null
  /**
   * Requests waiting for their replies, with what the worker last said it started for each, and
   * the data of a chunked reply so far.
   * @type {Map<unknown, { resolve: (reply: ProtocolMessage) => void, reject: (err: Error) => void, doing: { node?: string, method?: string } | null, parts: unknown[] }>}
   */
  const pending = new Map()
  /** @type {Set<(message: ProtocolMessage) => void>} */
  const listeners = new Set()
  /** @type {unknown} */
  let watchdog = null

  /** Restarts the silence countdown while requests wait, and ends it when none do. */
  const watch = () => {
    if (watchdog !== null) scheduler.clearTimeout(watchdog)
    watchdog = pending.size ? scheduler.setTimeout(hung, silenceMs) : null
  }

  /** Stops the worker and rejects every request still waiting. @param {Error} err */
  const stop = err => {
    worker?.terminate()
    worker = null
    for (const waiting of pending.values()) waiting.reject(err)
    pending.clear()
    watch()
  }

  function hung() {
    watchdog = null
    const doing = [...pending.values()].find(w => w.doing?.method)?.doing
    const s = silenceMs / 1000
    stop(
      doing
        ? new StrataError(
            'E_SIM_METHOD_HUNG',
            `The method '${doing.method}' of ${doing.node} ran for ${s} s without returning, so its worker was stopped`,
            doing
          )
        : new StrataError(
            'E_SIM_METHOD_HUNG',
            `The simulation worker was silent for ${s} s, so it was stopped`
          )
    )
  }

  /** @param {any} data */
  const received = data => {
    if (data?.v !== PROTOCOL_VERSION)
      return stop(
        new StrataError(
          'E_PROTOCOL_VERSION',
          `The simulation worker speaks protocol version ${data?.v}; this build speaks ${PROTOCOL_VERSION}`
        )
      )
    const waiting = pending.get(data.id)
    if (data.id === null) for (const listener of listeners) listener(data)
    else if (data.type === 'heartbeat') {
      if (waiting) waiting.doing = data.payload
    } else if (waiting && data.payload?.chunk < data.payload?.of - 1) {
      waiting.parts.push(...data.payload.data)
    } else if (waiting) {
      pending.delete(data.id)
      waiting.resolve(
        waiting.parts.length
          ? {
              ...data,
              payload: { chunk: 0, of: 1, data: [...waiting.parts, ...data.payload.data] },
            }
          : data
      )
    }
    watch()
  }

  return {
    request(message, transfer = []) {
      return new Promise((resolve, reject) => {
        pending.set(message.id, { resolve, reject, doing: null, parts: [] })
        worker ??= spawn({ message: received, error: stop })
        watch()
        worker.post(message, transfer)
      })
    },
    listen(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    terminate() {
      stop(new StrataError('E_SIM_STOPPED', 'The simulation worker was stopped'))
    },
  }
}
