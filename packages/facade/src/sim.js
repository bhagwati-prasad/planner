// @ts-check
/**
 * `strata.sim` (spec §11, §18), as far as the walking skeleton goes (tasks 0009, 0010): one
 * request over one edge of a system, with fixed latencies taken from the model's properties,
 * run by a simulation host. Task 0417 grows it into run handles with every control (spec §12).
 *
 * The host carries protocol messages to the kernel (eng §13 "Worker protocol"). The browser app
 * gives a Blob-URL Web Worker (createSimHost), Node a worker_threads worker, and tests strata-sim's
 * inProcessSimHost. The facade never imports strata-sim, so the main thread carries no
 * simulation code (ADR 0018).
 */
import { SIM_PROTOCOL_VERSION, StrataError, fail, statistic } from '../../core/src/index.js'

/**
 * @typedef {import('../../sim/src/skeleton.js').RunInput} RunInput
 * @typedef {import('../../sim/src/skeleton.js').RunResult} RunResult
 * @typedef {import('../../sim/src/protocol.js').ProtocolMessage} ProtocolMessage
 *
 * @typedef {object} SimHost
 * @property {(message: ProtocolMessage) => Promise<ProtocolMessage>} request
 *   delivers one protocol message to the kernel and resolves with its reply
 */

/** Default one-way latency of an edge whose connection type gives none, in microseconds. */
const DEFAULT_EDGE_LATENCY_US = 1000

/** The median of a distribution-valued property, in whole microseconds (values are in ms). */
function medianUs(value) {
  if (value === undefined || value === null) return undefined
  return Math.round(statistic(value, 'median') * 1000)
}

export class SimApi {
  #strata
  #host
  #nextId = 1

  /**
   * @param {{ project: any }} strata
   * @param {SimHost} [host]  none: simulations fail with E_SIM_NO_HOST
   */
  constructor(strata, host) {
    this.#strata = strata
    this.#host = host
  }

  /**
   * Runs one request over an edge of a system and resolves with the finished run: its trace, its
   * response and its run hash.
   * @param {object} [options]
   * @param {any} [options.system]  the system to run (default: the one the navigator shows)
   * @param {string} [options.edge] the edge the request travels (default: the system's first edge)
   * @param {number} [options.seed] the run seed (default 1)
   * @returns {Promise<RunResult>}
   * @example const run = await strata.sim.start({ seed: 42 }); run.response.atUs
   */
  async start({ system, edge, seed = 1 } = {}) {
    const project = this.#strata.project ?? fail('NOT_FOUND', 'No project is open')
    const input = runInput(system ?? project.nav.current ?? project.root, edge, seed)
    const host =
      this.#host ??
      fail(
        'E_SIM_NO_HOST',
        'No simulation host: the browser app starts one; in Node, pass simHost to createStrata (strata-sim has inProcessSimHost for scripts and tests)'
      )
    const reply = await host.request({
      v: SIM_PROTOCOL_VERSION,
      type: 'run',
      id: this.#nextId++,
      payload: input,
    })
    if (reply.type === 'error')
      throw new StrataError(reply.payload.code, reply.payload.message, reply.payload)
    return reply.payload
  }
}

/**
 * The kernel's input for one system: its components and edges with their fixed latencies, and
 * the request.
 * @param {any} system a SystemHandle
 * @param {string|undefined} edgeId
 * @param {number} seed
 * @returns {RunInput}
 */
function runInput(system, edgeId, seed) {
  const edges = [...system.edges()]
  if (!edges.length)
    fail(
      'E_SIM_NO_EDGE',
      `'${system.name}' has no edge for a request to travel; connect two components first`
    )
  const request = edgeId ? edges.find(e => e.id === edgeId) : edges[0]
  if (!request) fail('E_SIM_EDGE_NOT_FOUND', `Edge '${edgeId}' is not in '${system.name}'`)
  return {
    seed,
    model: {
      components: [...system.nodes()].map(node => ({
        id: node.id,
        name: node.name,
        serviceTimeUs: medianUs(node.props.serviceTime) ?? 0,
      })),
      edges: edges.map(e => ({
        id: e.id,
        from: e.from.node.id,
        to: e.to.node.id,
        latencyUs: medianUs(e.props.latency) ?? DEFAULT_EDGE_LATENCY_US,
      })),
    },
    request: { edge: request.id, method: 'request' },
  }
}
