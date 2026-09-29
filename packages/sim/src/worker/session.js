// @ts-check
/**
 * What the simulation worker does with each protocol message (eng §13 "Worker protocol"):
 *
 *   → load { scripts }            evaluates component behaviours (plugins' behaviourScript)
 *   ← load.result { components }  the `id@version` keys it loaded
 *   → call { component, node, method, input, seed, atUs }
 *                                 runs one public method of a component: a unit-style
 *                                 injection (spec §11 "Sources and load")
 *   ← call.result { output }      what the method returned
 *   → run { … }                   runs the kernel (protocol.js)
 *   ← heartbeat { node, method }  as a method starts, so the host can name one that never
 *                                 returns (spec §8 "Watchdog")
 *
 * Replies carry the request's `id` and move the buffers of their typed arrays as Transferables;
 * failures are `error` replies with a code.
 */
import { PROTOCOL_VERSION, handleMessage, transferables } from '../protocol.js'
import { createStreams } from '../random.js'

/**
 * @typedef {import('../protocol.js').ProtocolMessage} ProtocolMessage
 * @typedef {{ load: (path: string) => any }} ModuleRuntime
 * @typedef {(key: string, entry: string, runtime: ModuleRuntime) => void} Define
 *
 * The worker's globals, as the bootstrap left them (spec §8 "Sandbox").
 * @typedef {object} Sandbox
 * @property {(script: string, define: Define) => void} evaluate  evaluates a behaviour script,
 *   which calls `define`
 * @property {() => void} seal  no more code loads after this
 * @property {(clock: { random: () => number, nowMs: () => number }) => void} use  what
 *   `Math.random`, `Date.now` and `performance.now` return from now on
 */

/**
 * @param {object} options
 * @param {(message: ProtocolMessage, transfer?: any[]) => void} options.post  posts to the host
 * @param {Sandbox} options.sandbox
 */
export function createWorkerSession({ post, sandbox }) {
  /** @type {Map<string, { entry: string, runtime: ModuleRuntime }>} */
  const components = new Map()
  let sealed = false
  const seal = () => {
    if (sealed) return
    sealed = true
    sandbox.seal()
  }
  /** @param {ProtocolMessage['id']} id @param {string} type @param {unknown} payload */
  const reply = (id, type, payload) =>
    post({ v: PROTOCOL_VERSION, type, id, payload }, transferables(payload))
  /** @param {ProtocolMessage['id']} id @param {string} code @param {string} message */
  const refuse = (id, code, message) => reply(id, 'error', { code, message })

  /** @param {ProtocolMessage} message */
  const load = ({ id, payload }) => {
    if (sealed)
      return refuse(
        id,
        'E_SIM_SEALED',
        'This worker has loaded its components already; start a new worker to load others'
      )
    /** @type {string[]} */
    const loaded = []
    for (const script of payload?.scripts ?? [])
      sandbox.evaluate(script, (key, entry, runtime) => {
        components.set(key, { entry, runtime })
        loaded.push(key)
      })
    seal()
    reply(id, 'load.result', { components: loaded })
  }

  /** @param {ProtocolMessage} message */
  const call = async ({ id, payload }) => {
    seal()
    const { component, node, method, input = {}, seed = 1, atUs = 0 } = payload ?? {}
    const loaded = components.get(component)
    if (!loaded)
      return refuse(id, 'E_SIM_NOT_LOADED', `Component ${component} is not loaded in this worker`)
    const stream = createStreams(seed).stream(node)
    const random = () => stream.nextU32() / 2 ** 32
    const nowMs = () => atUs / 1000
    sandbox.use({ random, nowMs })
    const methods = loaded.runtime.load(loaded.entry).default?.public
    if (typeof methods?.[method] !== 'function')
      return refuse(id, 'E_METHOD_UNKNOWN', `${component} has no public method '${method}'`)
    post({ v: PROTOCOL_VERSION, type: 'heartbeat', id, payload: { node, method } })
    const output = await methods[method](input, { now: nowMs(), random })
    reply(id, 'call.result', { output })
  }

  return {
    /**
     * Answers one message. Never throws: failures become `error` replies.
     * @param {ProtocolMessage} message
     */
    async handle(message) {
      try {
        if (message?.v !== PROTOCOL_VERSION) return post(handleMessage(message))
        if (message.type === 'load') return load(message)
        if (message.type === 'call') return await call(message)
        seal()
        post(handleMessage(message))
      } catch (err) {
        const e = /** @type {any} */ (err)
        refuse(message?.id ?? null, e?.code ?? 'INVALID', String(e?.message ?? err))
      }
    },
  }
}
