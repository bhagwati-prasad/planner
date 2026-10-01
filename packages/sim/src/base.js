// @ts-check
/**
 * Base behaviours (spec §8 "Behaviour API", §9 "State and methods", task 0407): what a component
 * that extends a base type does without code. Each answers the public methods it knows, with
 * the state fields it declares here and a cost model from the component's properties; `any`
 * answers the other public methods a component declares. The run merges a base behaviour under
 * the component's own: its manifest's state fields and methods, and its entry's code, win.
 * These live in strata-sim, so they ship only in the worker (ADR 0018); the starter components
 * complete them in tasks 0408 to 0411.
 *
 * A base behaviour's `latency` names, for each method (`*` for any other), the properties that
 * hold its latency, the first one the component has. A manifest's own `latency` for a method
 * comes first.
 */

/**
 * @typedef {object} BaseBehaviour
 * @property {Record<string, object>} [state]  state fields its methods use
 * @property {Record<string, string[]>} [latency]  by method, the properties holding its latency
 * @property {Servers} [servers]  the servers its public calls queue for (ADR 0020)
 * @property {Record<string, Function>} public
 * @property {Function} [any]  answers public methods it does not know
 */

/**
 * The servers a node's public calls queue for (ADR 0020). Each entry names a property, or a
 * state field as `state.<name>`, or is a number. `count` multiplies its entries, and a node
 * that lacks one has no limit; `backlog` bounds the calls that wait (none: no bound); `timeout`
 * is how long, in ms, a call may wait (none: for ever). `metrics` names the gauges of the busy and
 * the waiting servers; the run records waiting calls as `backlog` without one.
 * @typedef {{ count: (string|number)[], backlog?: string|number, timeout?: string|number, metrics?: { busy?: string, waiting?: string } }} Servers
 */

/** @typedef {any} Msg @typedef {any} Ctx */

const nothing = () => null

/** @type {Record<string, BaseBehaviour>} */
export const BASE_BEHAVIOURS = {
  'base:client': { public: {} },

  'base:service': {
    servers: { count: ['instances', 'concurrency'], backlog: 'maxBacklog', timeout: 'timeout' },
    latency: { '*': ['serviceTime'] },
    public: { health: () => ({ status: 'up' }) },
    any: nothing,
  },

  'base:queue': {
    state: {
      messages: { type: 'queue', initial: [] },
      inFlight: { type: 'map', initial: {} },
      published: { type: 'integer', initial: 0 },
    },
    public: {
      publish(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        const { capacityMessages } = ctx.props
        if (capacityMessages && ctx.state.messages.length >= capacityMessages)
          return ctx.fail('QUEUE_FULL', { capacity: capacityMessages })
        const id = ++ctx.state.published
        ctx.state.messages.push({ id, body: msg.body })
        return { id }
      },
      receive(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
        const message = ctx.state.messages.shift()
        if (!message) return null
        ctx.state.inFlight[message.id] = message
        return message
      },
      ack(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        const id = msg.body?.id
        if (!(id in ctx.state.inFlight)) return ctx.fail('UNKNOWN_MESSAGE', { id })
        delete ctx.state.inFlight[id]
        return null
      },
      nack(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        const id = msg.body?.id
        const message = ctx.state.inFlight[id]
        if (!message) return ctx.fail('UNKNOWN_MESSAGE', { id })
        delete ctx.state.inFlight[id]
        ctx.state.messages.unshift(message)
        return null
      },
    },
    any: nothing,
  },

  'base:topic': {
    state: {
      log: { type: 'list', initial: [] },
      offsets: { type: 'map', values: { type: 'integer' }, initial: {} },
    },
    public: {
      publish(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        const offset = ctx.state.log.length
        ctx.state.log.push({ offset, body: msg.body })
        return { offset }
      },
      subscribe(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        const group = String(msg.body?.group)
        ctx.state.offsets[group] ??= 0
        return { offset: ctx.state.offsets[group] }
      },
      poll(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        return ctx.state.log.slice(ctx.state.offsets[String(msg.body?.group)] ?? 0)
      },
      commit(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        ctx.state.offsets[String(msg.body?.group)] = msg.body?.offset
        return null
      },
    },
    any: nothing,
  },

  'base:store': {
    state: { items: { type: 'map', initial: {} } },
    latency: {
      get: ['readLatency', 'latency'],
      query: ['readLatency', 'latency'],
      '*': ['writeLatency', 'latency'],
    },
    public: {
      get: (/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) =>
        ctx.state.items[msg.body?.key] ?? null,
      put(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        ctx.state.items[msg.body?.key] = msg.body?.value
        return null
      },
      delete(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        delete ctx.state.items[msg.body?.key]
        return null
      },
      query: (/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) => Object.values(ctx.state.items),
    },
    any: nothing,
  },

  'base:cache': {
    state: { entries: { type: 'map', initial: {} } },
    latency: { '*': ['hitLatency'] },
    public: {
      get: (/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) =>
        ctx.state.entries[msg.body?.key] ?? null,
      set(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        ctx.state.entries[msg.body?.key] = msg.body?.value
        return null
      },
      delete(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        delete ctx.state.entries[msg.body?.key]
        return null
      },
    },
    any: nothing,
  },

  'base:proxy': {
    latency: { '*': ['processingLatency', 'transformLatency', 'edgeLatency'] },
    public: {},
    // Forwards on `out` with no method, so the edge's method is called (ADR 0019).
    any: (/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) =>
      ctx.send('out', null, msg.body, { path: msg.path, headers: msg.headers }),
  },

  'base:timer': {
    state: {
      paused: { type: 'boolean', initial: false },
      runs: { type: 'integer', initial: 0 },
    },
    public: {
      trigger(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
        if (ctx.state.paused) return ctx.fail('PAUSED')
        ctx.emit('out', null, msg.body)
        return { runs: ++ctx.state.runs }
      },
      pause(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
        ctx.state.paused = true
        return null
      },
      resume(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
        ctx.state.paused = false
        return null
      },
    },
    any: nothing,
  },

  'base:external': {
    latency: { '*': ['latency'] },
    public: {},
    any: (/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) =>
      ctx.random() < (ctx.props.errorRate ?? 0) ? ctx.fail('UNAVAILABLE') : null,
  },
}

/**
 * The base behaviour of a manifest: that of the first type in its lineage that has one.
 * @param {{ id: string, extends?: string|null, lineage?: string[] }} manifest
 * @returns {BaseBehaviour|null}
 */
export function baseOf(manifest) {
  for (const id of manifest.lineage ?? [manifest.id, manifest.extends ?? ''])
    if (Object.hasOwn(BASE_BEHAVIOURS, id)) return BASE_BEHAVIOURS[id]
  return null
}

/**
 * The properties that hold a method's latency under a base behaviour, if it names any.
 * @param {BaseBehaviour|null} base @param {string} method
 */
export function baseLatency(base, method) {
  return base?.latency?.[method] ?? base?.latency?.['*']
}
