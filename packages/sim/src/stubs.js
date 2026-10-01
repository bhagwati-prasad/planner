// @ts-check
/**
 * Outbound stubs (spec §11 "Scope", eng §13 "Method dispatch, scope and stubs"): the component
 * at the end of an edge leaving a run's scope, in place of the one outside it. A stub has the
 * port the edge reaches, with its methods and default. A fixed stub answers each call after a
 * draw from its latency, fails at its error rate, and otherwise answers with its response. A
 * recorded stub replays the responses a wider run recorded at the edge, matched by method and
 * call order, each after as long as it took; a call with none left fails with
 * E_STUB_NO_RECORDING.
 */
import { StrataError } from '../../core/src/index.js'

/**
 * @typedef {{ mode?: 'fixed', latency?: unknown, errorRate?: number, errorCode?: string, response?: unknown }} FixedStub
 *   latency in ms, or a distribution of ms; errorRate a fraction; errors fail with errorCode,
 *   UNAVAILABLE by default
 * @typedef {{ mode: 'recorded', calls: import('./run.js').Recording[] }} RecordedStub
 * @typedef {{ mode: 'blackbox' }} BlackBoxStub  the component outside runs as a black box,
 *   without its own downstream calls
 * @typedef {FixedStub|RecordedStub|BlackBoxStub} Stub
 */

/**
 * A fixed stub's answer to every call.
 * @param {FixedStub} stub
 */
const fixed = stub => async (/** @type {any} */ _msg, /** @type {any} */ ctx) => {
  await ctx.spend(stub.latency ?? 0)
  if (ctx.random() < (stub.errorRate ?? 0)) return ctx.fail(stub.errorCode ?? 'UNAVAILABLE', {})
  return stub.response ?? null
}

/**
 * A recorded stub's answer to every call: the next recorded response to its method.
 * @param {RecordedStub} stub
 */
const recorded = stub => async (/** @type {any} */ msg, /** @type {any} */ ctx) => {
  const n = ctx.state.replayed[msg.method] ?? 0
  const call = stub.calls.filter(c => c.method === msg.method)[n]
  if (!call?.response)
    throw new StrataError(
      'E_STUB_NO_RECORDING',
      `No recorded response is left for call ${n + 1} of '${msg.method}'`,
      { method: msg.method, call: n + 1 }
    )
  ctx.state.replayed[msg.method] = n + 1
  const { response } = call
  await ctx.spend((response.atUs - call.atUs) / 1000)
  if (response.ok) return response.body
  return ctx.fail(response.error?.code ?? 'FAILED', response.error?.details)
}

/**
 * A stub node standing in for the component at the end of an edge leaving a scope.
 * @param {string} id
 * @param {{ name: string, exposes?: string[], default?: string }} port  the port the edge reaches
 * @param {FixedStub|RecordedStub} stub
 * @returns {import('./run.js').RunNode}
 */
export function stubNode(id, port, stub) {
  const methods = port.exposes ?? []
  const answer = stub.mode === 'recorded' ? recorded(stub) : fixed(/** @type {FixedStub} */ (stub))
  return {
    id,
    manifest: {
      strataApi: '^1.0',
      id: 'strata.stub',
      name: `Stub of ${port.name}`,
      version: '1.0.0',
      ports: [
        {
          name: port.name,
          direction: 'in',
          exposes: methods,
          ...(port.default ? { default: port.default } : {}),
        },
      ],
      methods: { public: Object.fromEntries(methods.map(m => [m, {}])) },
      state: { replayed: { type: 'map', initial: {} } },
    },
    behaviour: { public: Object.fromEntries(methods.map(m => [m, answer])) },
  }
}
