// @ts-check
/**
 * The walking skeleton's run (task 0009): one request from a client component to a service
 * over one edge, answered after the service's fixed processing time. Latencies are fixed
 * integers; the seed drives the trace and span ids. M04 replaces this with scenarios, `ctx`
 * dispatch and component behaviour (tasks 0401–0405).
 */
import { fail } from '../../core/src/index.js'
import { ENGINE_VERSION, Kernel } from './kernel.js'
import { runHash } from './hash.js'
import { createStreams, hexId } from './random.js'

/**
 * @typedef {object} RunComponent
 * @property {string} id
 * @property {string} name
 * @property {number} [serviceTimeUs]  fixed time to answer a request
 *
 * @typedef {object} RunEdge
 * @property {string} id
 * @property {string} from       component id
 * @property {string} to         component id
 * @property {number} latencyUs  fixed one-way latency
 *
 * @typedef {object} RunInput
 * @property {number} seed
 * @property {{ components: RunComponent[], edges: RunEdge[] }} model
 * @property {{ edge: string, method: string }} request  what the client sends, and over which edge
 *
 * @typedef {object} Message  a subset of spec §11 "Messages"
 * @property {string} id
 * @property {'request'|'response'} kind
 * @property {string} traceId
 * @property {string} spanId
 * @property {string} method
 * @property {string} from
 * @property {string} to
 * @property {string} edge
 *
 * @typedef {{ atUs: number, event: 'sent'|'received', at: string, message: Message }} TraceEntry
 *
 * @typedef {object} RunResult
 * @property {string} engine
 * @property {number} seed
 * @property {{ atUs: number, traceId: string, method: string, status: 'ok' } | null} response
 * @property {TraceEntry[]} trace
 * @property {number} events  kernel events handled
 * @property {string} hash    the run hash
 */

/**
 * The edge the request travels, with both of its components present.
 * @param {RunInput} input
 */
function requestEdge({ model, request }) {
  const edge =
    model.edges.find(e => e.id === request.edge) ??
    fail('E_SIM_EDGE_NOT_FOUND', `Edge '${request.edge}' is not in the model`, {
      edgeId: request.edge,
    })
  for (const id of [edge.from, edge.to])
    if (!model.components.some(c => c.id === id))
      fail('E_SIM_COMPONENT_NOT_FOUND', `Component '${id}' is not in the model`, {
        componentId: id,
      })
  return edge
}

/**
 * The client's request, with ids from the client's own stream.
 * @param {{ nextU32: () => number }} client
 * @param {RunEdge} edge
 * @param {string} method
 * @returns {Message}
 */
function firstRequest(client, edge, method) {
  return {
    id: hexId(client, 2),
    kind: 'request',
    traceId: hexId(client, 4),
    spanId: hexId(client, 2),
    method,
    from: edge.from,
    to: edge.to,
    edge: edge.id,
  }
}

/**
 * Runs the skeleton scenario to completion.
 * @param {RunInput} input
 * @returns {RunResult}
 */
export function simulate(input) {
  const { seed, model, request } = input
  const edge = requestEdge(input)
  const serviceTimeUs = new Map(model.components.map(c => [c.id, c.serviceTimeUs ?? 0]))
  const streams = createStreams(seed)
  const kernel = new Kernel()
  /** @type {TraceEntry[]} */
  const trace = []
  /** @type {RunResult['response']} */
  let response = null

  /** @param {Message} message */
  const send = message => {
    trace.push({ atUs: kernel.nowUs, event: 'sent', at: message.from, message })
    kernel.schedule(edge.latencyUs, { type: 'deliver', message })
  }
  /** @param {{ message: Message }} event */
  const deliver = ({ message }) => {
    trace.push({ atUs: kernel.nowUs, event: 'received', at: message.to, message })
    if (message.kind === 'request')
      kernel.schedule(serviceTimeUs.get(message.to) ?? 0, { type: 'respond', message })
    else
      response = {
        atUs: kernel.nowUs,
        traceId: message.traceId,
        method: message.method,
        status: 'ok',
      }
  }
  /** @param {{ message: Message }} event */
  const respond = ({ message }) =>
    send({
      ...message,
      id: hexId(streams.stream(message.to), 2),
      kind: 'response',
      from: message.to,
      to: message.from,
    })

  send(firstRequest(streams.stream(edge.from), edge, request.method))
  kernel.run({ deliver, respond })

  const results = { response, trace, events: kernel.processed }
  const hash = runHash({ engine: ENGINE_VERSION, seed, settings: {}, model, results })
  return { engine: ENGINE_VERSION, seed, ...results, hash }
}
