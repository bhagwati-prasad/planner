// @ts-check
/**
 * runComponent (ADR 0020): one component in the kernel, for self-tests that need simulated
 * time, servers or timers, which `strata/testing` offers beside createTestContext. Its
 * properties are written as a person writes them ('5s', '10MB'). Each of its out ports reaches a
 * stub that answers from `replies`, as createTestContext's ctx.send does: by 'port.method', or by
 * 'port' for a send that names no method (ADR 0019). A reply is a value, or a function of the
 * body; a function that throws answers with a failure of the thrown `code` (FAILED without one).
 * `edges` gives the edge from an out port its connection's properties, such as a latency, as a
 * person writes them. `targets` puts several stubs behind one port, one per name, each answering
 * by 'name.method' or 'name' before the port's replies (ADR 0022); a reply function gets the
 * body and `{ node }`, the target's name. Their edges take `edges['port:name']` over `edges.port`.
 */
import { BUILTIN_MANIFESTS, normalizeManifest, validateValue } from '../../core/src/index.js'
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
 * A stub node that answers what reaches it from the component's port `port`: by its own name's
 * replies first, when it is one of the port's targets, then by the port's.
 * @param {string} id @param {string} port @param {Record<string, unknown>} replies
 * @param {string|null} [name]  its target name
 */
function stub(id, port, replies, name = null) {
  const prefixes = name === null ? [port] : [name, port]
  const methods = [
    ...new Set([
      'reply',
      ...Object.keys(replies).flatMap(key =>
        prefixes.filter(p => key.startsWith(`${p}.`)).map(p => key.slice(p.length + 1))
      ),
    ]),
  ]
  /** @param {string} method */
  const answer = method => (/** @type {any} */ msg, /** @type {any} */ ctx) => {
    const keys = prefixes.map(p => (method === 'reply' ? p : `${p}.${method}`))
    const reply = replies[keys.find(key => key in replies) ?? '']
    try {
      return typeof reply === 'function' ? reply(msg.body, { node: id }) : (reply ?? null)
    } catch (err) {
      const { code, message } = /** @type {any} */ (err) ?? {}
      return ctx.fail(code ?? 'FAILED', { message })
    }
  }
  return {
    id,
    manifest: {
      strataApi: '^1.0',
      id: 'strata.stub',
      name: `Stub of ${id}`,
      version: '1.0.0',
      ports: [{ name: 'in', direction: 'in', exposes: methods, default: 'reply' }],
      methods: { public: Object.fromEntries(methods.map(m => [m, {}])) },
    },
    behaviour: { public: Object.fromEntries(methods.map(m => [m, answer(m)])) },
  }
}

/**
 * Runs one component in the kernel, with its out ports answered from `replies`.
 * @param {{ manifest: object, behaviour?: object, props?: Record<string, unknown>, state?: Record<string, unknown>, fixtures?: Record<string, { csv: string }>, seed?: number, replies?: Record<string, unknown>, edges?: Record<string, Record<string, unknown>>, targets?: Record<string, string[]> }} options
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
  edges = {},
  targets = {},
}) {
  const m = /** @type {any} */ (normalizeManifest(manifest))
  const connection = /** @type {any} */ (BUILTIN_MANIFESTS.find(t => t.id === 'base:connection'))
  /** Values as written, in canonical units. @param {Record<string, unknown>} values @param {Record<string, any>} schemas @param {string} at */
  const canonical = (values, schemas, at) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        schemas[key] ? validateValue(schemas[key], value, `${at}.${key}`) : value,
      ])
    )
  /** Each out port's stubs: one per target it names, or one for the port. */
  const stubs = m.ports
    .filter((/** @type {any} */ p) => p.direction !== 'in')
    .flatMap((/** @type {any} */ { name: port }) =>
      targets[port]
        ? targets[port].map(name => ({ port, name, id: name, edge: `${port}:${name}` }))
        : [{ port, name: null, id: `stub:${port}`, edge: `stub:${port}` }]
    )
  const run = createRun({
    seed,
    nodes: /** @type {any} */ ([
      {
        id: 'it',
        manifest,
        behaviour,
        props: canonical(props, m.properties ?? {}, 'props'),
        ...(state ? { state } : {}),
        ...(fixtures ? { fixtures } : {}),
      },
      ...stubs.map(({ port, name, id }) => stub(id, port, replies, name)),
    ]),
    edges: stubs.map(({ port, id, edge }) => ({
      id: edge,
      from: { node: 'it', port },
      to: { node: id, port: 'in' },
      props: canonical(
        { ...edges[port], ...edges[edge] },
        connection.properties,
        `edges.${edges[edge] ? edge : port}`
      ),
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
