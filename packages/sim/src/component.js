// @ts-check
/**
 * runComponent (ADR 0020): one component in the kernel, for self-tests that need simulated
 * time, servers or timers, which `strata/testing` offers beside createTestContext. Its
 * properties are written as a person writes them ('5s', '10MB'). Each of its out ports reaches a
 * stub that answers from `replies`, as createTestContext's ctx.send does: by 'port.method', or by
 * 'port' for a send that names no method (ADR 0019). A reply is a value, or a function of the
 * body; a function that throws answers with a failure of the thrown `code` (FAILED without one).
 */
import { normalizeManifest, validateValue } from '../../core/src/index.js'
import { createRun } from './run.js'

/**
 * @typedef {object} ComponentRun
 * @property {import('./run.js').Run} run
 * @property {(method: string, body?: unknown, options?: { port?: string, atMs?: number, path?: string, headers?: Record<string, string>, sizeBytes?: number }) => import('./run.js').Reply} call
 *   sends a request to the component, at `atMs` (0 by default), on the port that exposes the
 *   method unless `port` names one
 * @property {(ms: number) => Promise<void>} runUntil  handles the events due by `ms`
 * @property {import('./run.js').Span[]} spans
 * @property {import('./run.js').Run['metrics']} metrics
 * @property {import('./run.js').Run['changes']} changes
 */

/**
 * A stub node that answers what reaches it from the component's port `port`.
 * @param {string} port @param {Record<string, unknown>} replies
 */
function stub(port, replies) {
  const prefix = `${port}.`
  const named = Object.keys(replies)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
  const methods = ['reply', ...named]
  /** @param {string} key */
  const answer = key => (/** @type {any} */ msg, /** @type {any} */ ctx) => {
    const reply = replies[key]
    try {
      return typeof reply === 'function' ? reply(msg.body) : (reply ?? null)
    } catch (err) {
      const { code, message } = /** @type {any} */ (err) ?? {}
      return ctx.fail(code ?? 'FAILED', { message })
    }
  }
  return {
    id: `stub:${port}`,
    manifest: {
      strataApi: '^1.0',
      id: 'strata.stub',
      name: `Stub of ${port}`,
      version: '1.0.0',
      ports: [{ name: 'in', direction: 'in', exposes: methods, default: 'reply' }],
      methods: { public: Object.fromEntries(methods.map(m => [m, {}])) },
    },
    behaviour: {
      public: Object.fromEntries(methods.map(m => [m, answer(m === 'reply' ? port : prefix + m)])),
    },
  }
}

/**
 * Runs one component in the kernel, with its out ports answered from `replies`.
 * @param {{ manifest: object, behaviour?: object, props?: Record<string, unknown>, state?: Record<string, unknown>, fixtures?: Record<string, { csv: string }>, seed?: number, replies?: Record<string, unknown> }} options
 * @returns {ComponentRun}
 * @example
 * const api = runComponent({ manifest, behaviour, props: { instances: 2, concurrency: 4 } })
 * const reply = api.call('placeOrder', order)
 * await api.runUntil(1000)
 */
export function runComponent({
  manifest,
  behaviour,
  props = {},
  state,
  fixtures,
  seed = 1,
  replies = {},
}) {
  const m = /** @type {any} */ (normalizeManifest(manifest))
  const schemas = m.properties ?? {}
  const canonical = Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      schemas[key] ? validateValue(schemas[key], value, `props.${key}`) : value,
    ])
  )
  const outs = m.ports
    .filter((/** @type {any} */ p) => p.direction !== 'in')
    .map((/** @type {any} */ p) => p.name)
  const run = createRun({
    seed,
    nodes: /** @type {any} */ ([
      {
        id: 'it',
        manifest,
        behaviour,
        props: canonical,
        ...(state ? { state } : {}),
        ...(fixtures ? { fixtures } : {}),
      },
      ...outs.map((/** @type {string} */ port) => stub(port, replies)),
    ]),
    edges: outs.map((/** @type {string} */ port) => ({
      id: `stub:${port}`,
      from: { node: 'it', port },
      to: { node: `stub:${port}`, port: 'in' },
    })),
  })
  return {
    run,
    call(method, body, { port, atMs = 0, ...details } = {}) {
      const via =
        port ?? m.ports.find((/** @type {any} */ p) => p.exposes?.includes(method))?.name ?? 'in'
      return run.inject({
        node: 'it',
        port: via,
        method,
        body,
        atUs: Math.round(atMs * 1000),
        ...details,
      })
    },
    runUntil: ms => run.runToEnd({ untilUs: Math.round(ms * 1000) }),
    get spans() {
      return run.spans
    },
    get metrics() {
      return run.metrics
    },
    get changes() {
      return run.changes
    },
  }
}
