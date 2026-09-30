// @ts-check
// Method dispatch and ctx (task 0403, spec §6, §8 "Behaviour API", §11 "Method dispatch"):
// every hop is a public-method call on a port that exposes it, private methods run inside the
// caller's processing as child spans, and ctx promises are resolved by kernel events.
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDevelopment, setDevelopment } from '../../core/src/index.js'
import * as sim from '../src/index.js'

const MS = 1000
const development = isDevelopment()
afterEach(() => setDevelopment(development))

/**
 * A component type for a run: its manifest's ports, methods, state and properties, and its
 * behaviour module's default export.
 * @param {string} id
 * @param {{ ports?: object[], methods?: object, state?: object, properties?: object }} parts
 * @param {object} behaviour
 */
function component(id, parts, behaviour) {
  return {
    manifest: {
      strataApi: '^1.0',
      id,
      name: id,
      version: '1.0.0',
      extends: 'base:service',
      ports: [],
      methods: {},
      ...parts,
    },
    behaviour,
  }
}

const inPort = (/** @type {string[]} */ ...exposes) => ({ name: 'in', direction: 'in', exposes })
const outPort = { name: 'out', direction: 'out' }
const constant = (/** @type {number} */ ms) => ({ kind: 'constant', value: ms })

/**
 * A run of the named nodes, joined by edges written 'from.port -> to.port' with a latency in ms.
 * @param {Record<string, ReturnType<typeof component>>} nodes
 * @param {[string, number][]} [edges]
 * @param {number} [seed]
 */
function runOf(nodes, edges = [], seed = 1) {
  return sim.createRun({
    seed,
    nodes: Object.entries(nodes).map(([id, c]) => ({ id, ...c })),
    edges: edges.map(([path, ms], i) => {
      const [from, to] = path.split(' -> ').map(end => {
        const [node, port] = end.split('.')
        return { node, port }
      })
      return { id: `e${i + 1}`, from, to, latencyUs: ms * MS }
    }),
  })
}

describe('method dispatch', () => {
  it('fails a message naming a method the port does not expose with E_METHOD_NOT_EXPOSED', async () => {
    const run = runOf({
      api: component(
        't.api',
        { ports: [inPort('get')], methods: { public: { get: {}, put: {} } } },
        { public: { get: () => 'got', put: () => 'put' } }
      ),
    })
    const reply = run.inject({ node: 'api', port: 'in', method: 'put' })
    await run.runToEnd()
    assert.equal(reply.error?.code, 'E_METHOD_NOT_EXPOSED')
    assert.match(String(reply.error?.message), /'put'.*'in'/)
    const span = run.spans.find(s => s.method === 'put')
    assert.deepEqual([span?.status, span?.code], ['error', 'E_METHOD_NOT_EXPOSED'], 'in the trace')
  })

  it('never reaches a private method over an edge, even when a message names it', async () => {
    let expired = false
    const run = runOf(
      {
        caller: component(
          't.caller',
          { ports: [inPort('go'), outPort], methods: { public: { go: {} } } },
          {
            public: {
              async go(/** @type {any} */ _msg, /** @type {any} */ ctx) {
                try {
                  return await ctx.send('out', 'expire')
                } catch (err) {
                  return { refused: /** @type {any} */ (err).code }
                }
              },
            },
          }
        ),
        queue: component(
          't.queue',
          {
            ports: [inPort('publish')],
            methods: { public: { publish: {} }, private: { expire: {} } },
          },
          {
            public: { publish: () => ({ ok: true }) },
            private: {
              expire() {
                expired = true
              },
            },
          }
        ),
      },
      [['caller.out -> queue.in', 1]]
    )
    const direct = run.inject({ node: 'queue', port: 'in', method: 'expire' })
    const viaEdge = run.inject({ node: 'caller', port: 'in', method: 'go' })
    await run.runToEnd()
    assert.equal(direct.error?.code, 'E_METHOD_NOT_EXPOSED')
    assert.deepEqual(viaEdge.body, { refused: 'E_METHOD_NOT_EXPOSED' })
    assert.equal(expired, false, 'the private method never ran')
  })

  it('resumes await ctx.send at the simulated time the response arrives, while other messages keep processing', async () => {
    const run = runOf(
      {
        front: component(
          't.front',
          {
            ports: [inPort('order', 'ping'), outPort],
            methods: { public: { order: {}, ping: {} } },
          },
          {
            public: {
              async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
                const stock = await ctx.send('out', 'reserve', { sku: msg.body.sku })
                return { stock, at: ctx.now }
              },
              ping: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ({ at: ctx.now }),
            },
          }
        ),
        stock: component(
          't.stock',
          {
            ports: [inPort('reserve')],
            methods: { public: { reserve: { latency: constant(10) } } },
          },
          { public: { reserve: (/** @type {any} */ msg) => ({ reserved: msg.body.sku }) } }
        ),
      },
      [['front.out -> stock.in', 1]]
    )
    const order = run.inject({ node: 'front', port: 'in', method: 'order', body: { sku: 'a' } })
    const ping = run.inject({ node: 'front', port: 'in', method: 'ping', atUs: 5 * MS })
    await run.runToEnd()
    // 1 ms to the stock service, 10 ms there, 1 ms back.
    assert.deepEqual([order.atUs, order.body], [12 * MS, { stock: { reserved: 'a' }, at: 12 }])
    assert.deepEqual([ping.atUs, ping.body], [5 * MS, { at: 5 }], 'answered while order waited')
    const spans = Object.fromEntries(run.spans.map(s => [s.method, s]))
    assert.equal(spans.reserve.parentSpanId, spans.order.spanId, 'the call is a child span')
    assert.deepEqual([spans.reserve.startUs, spans.reserve.endUs], [1 * MS, 11 * MS])
  })

  it('delays the caller by a private call’s declared latency, and records the call as a child span', async () => {
    const run = runOf({
      api: component(
        't.api',
        {
          ports: [inPort('handle')],
          methods: { public: { handle: {} }, private: { validate: { latency: constant(5) } } },
        },
        {
          public: {
            handle(/** @type {any} */ msg, /** @type {any} */ ctx) {
              return { valid: ctx.call('validate', msg.body) }
            },
          },
          private: { validate: (/** @type {any} */ body) => body === 'ok' },
        }
      ),
    })
    const reply = run.inject({ node: 'api', port: 'in', method: 'handle', body: 'ok' })
    await run.runToEnd()
    assert.deepEqual([reply.atUs, reply.body], [5 * MS, { valid: true }])
    const handle = run.spans.find(s => s.method === 'handle')
    const validate = run.spans.find(s => s.method === 'validate')
    assert.deepEqual(
      [validate?.kind, validate?.parentSpanId, validate?.startUs, validate?.endUs],
      ['private', handle?.spanId, 0, 5 * MS]
    )
    assert.equal(handle?.endUs, 5 * MS)
  })

  it('fails a write to an undeclared state field in development builds', async () => {
    const counter = () =>
      runOf({
        api: component(
          't.counter',
          {
            ports: [inPort('handle')],
            methods: { public: { handle: {} } },
            state: { handled: { type: 'integer', initial: 0 } },
          },
          {
            public: {
              handle(/** @type {any} */ _msg, /** @type {any} */ ctx) {
                ctx.state.handled += 1
                ctx.state.extra = true
                return ctx.state.handled
              },
            },
          }
        ),
      })
    setDevelopment(true)
    const dev = counter()
    const refused = dev.inject({ node: 'api', port: 'in', method: 'handle' })
    await dev.runToEnd()
    assert.equal(refused.error?.code, 'E_BEHAVIOUR_UNDECLARED_STATE')
    assert.match(String(refused.error?.message), /state\.extra/)

    setDevelopment(false)
    const prod = counter()
    const allowed = prod.inject({ node: 'api', port: 'in', method: 'handle' })
    await prod.runToEnd()
    assert.equal(allowed.body, 1, 'production builds skip the check')
  })
})

describe('ctx', () => {
  it('schedules timers that call onTimer, emits without waiting, and fails with a code', async () => {
    /** @type {unknown[]} */
    const received = []
    const run = runOf(
      {
        clock: component(
          't.clock',
          {
            ports: [inPort('start', 'refuse'), outPort],
            methods: { public: { start: {}, refuse: {} } },
          },
          {
            public: {
              start(/** @type {any} */ _msg, /** @type {any} */ ctx) {
                ctx.schedule(3, 'tick', { n: 1 })
                return 'started'
              },
              refuse: (/** @type {any} */ _msg, /** @type {any} */ ctx) =>
                ctx.fail('E_FULL', { capacity: 0 }),
            },
            onTimer(/** @type {any} */ timer, /** @type {any} */ ctx) {
              ctx.emit('out', 'note', { ...timer.data, at: ctx.now })
            },
          }
        ),
        sink: component(
          't.sink',
          { ports: [inPort('note')], methods: { public: { note: {} } } },
          { public: { note: (/** @type {any} */ msg) => void received.push(msg.body) } }
        ),
      },
      [['clock.out -> sink.in', 2]]
    )
    const started = run.inject({ node: 'clock', port: 'in', method: 'start' })
    const refused = run.inject({ node: 'clock', port: 'in', method: 'refuse' })
    await run.runToEnd()
    assert.deepEqual([started.atUs, started.body], [0, 'started'])
    assert.deepEqual(received, [{ n: 1, at: 3 }], 'the timer fired at 3 ms and the note took 2 ms')
    assert.deepEqual(refused.error, {
      code: 'E_FULL',
      message: 'clock failed with E_FULL',
      details: { capacity: 0 },
    })
    const timer = run.spans.find(s => s.kind === 'timer')
    assert.deepEqual([timer?.method, timer?.startUs], ['tick', 3 * MS])
  })

  it('rejects the caller’s ctx.send with the code and details of a component’s own failure', async () => {
    setDevelopment(true)
    const run = runOf(
      {
        caller: component(
          't.caller',
          { ports: [inPort('go', 'pass'), outPort], methods: { public: { go: {}, pass: {} } } },
          {
            public: {
              async go(/** @type {any} */ _msg, /** @type {any} */ ctx) {
                try {
                  return await ctx.send('out', 'take')
                } catch (err) {
                  const e = /** @type {any} */ (err)
                  return { code: e.code, details: e.details }
                }
              },
              pass: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ctx.send('out', 'take'),
            },
          }
        ),
        queue: component(
          't.queue',
          { ports: [inPort('take')], methods: { public: { take: {} } } },
          {
            public: {
              take: (/** @type {any} */ _msg, /** @type {any} */ ctx) =>
                ctx.fail('QUEUE_EMPTY', { depth: 0 }),
            },
          }
        ),
      },
      [['caller.out -> queue.in', 1]]
    )
    const reply = run.inject({ node: 'caller', port: 'in', method: 'go' })
    const passed = run.inject({ node: 'caller', port: 'in', method: 'pass' })
    await run.runToEnd()
    assert.deepEqual(reply.body, { code: 'QUEUE_EMPTY', details: { depth: 0 } })
    assert.deepEqual(
      [passed.error?.code, passed.error?.details],
      ['QUEUE_EMPTY', { depth: 0 }],
      'a caller that does not catch passes the failure on'
    )
  })

  it('draws random numbers and samples from the node’s own seeded stream', async () => {
    /** @type {number[]} */
    const draws = []
    const run = runOf(
      {
        dice: component(
          't.dice',
          { ports: [inPort('roll')], methods: { public: { roll: {} } } },
          {
            public: {
              roll(/** @type {any} */ _msg, /** @type {any} */ ctx) {
                draws.push(
                  ctx.random(),
                  ctx.sample({ kind: 'exponential', mean: 4 }),
                  ctx.sample(7)
                )
              },
            },
          }
        ),
      },
      [],
      42
    )
    run.inject({ node: 'dice', port: 'in', method: 'roll' })
    await run.runToEnd()
    const stream = sim.createStreams(42).stream('dice')
    const u = () => stream.nextU32() / 2 ** 32
    assert.deepEqual(draws, [u(), -4 * sim.log(1 - u()), 7])
  })

  it('records metrics and logs with the node and time, and reads defaults and values from props', async () => {
    const run = runOf({
      api: component(
        't.api',
        {
          ports: [inPort('handle')],
          methods: { public: { handle: {} } },
          properties: {
            limit: { type: 'integer', default: 10 },
            region: { type: 'string', default: 'eu' },
          },
        },
        {
          public: {
            handle(/** @type {any} */ _msg, /** @type {any} */ ctx) {
              ctx.metric('depth', 3)
              ctx.log('info', 'handled', ctx.props.limit)
              return ctx.props
            },
          },
        }
      ),
    })
    const reply = run.inject({ node: 'api', port: 'in', method: 'handle', atUs: 2 * MS })
    await run.runToEnd()
    assert.deepEqual(reply.body, { limit: 10, region: 'eu' })
    assert.deepEqual(run.metrics, [{ atUs: 2 * MS, node: 'api', name: 'depth', value: 3 }])
    assert.deepEqual(run.logs, [
      { atUs: 2 * MS, node: 'api', level: 'info', args: ['handled', 10] },
    ])
  })

  it('answers a port it lacks, a method without behaviour, an unknown private method, a send with no edge and a throw with their codes', async () => {
    const run = runOf({
      api: component(
        't.api',
        {
          ports: [inPort('bare', 'secret', 'lonely', 'broken', 'later'), outPort],
          methods: { public: { bare: {}, secret: {}, lonely: {}, broken: {}, later: {} } },
        },
        {
          public: {
            secret: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ctx.call('hidden'),
            lonely: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ctx.send('out', 'get'),
            broken() {
              throw new Error('boom')
            },
            bare: undefined,
            later: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ctx.schedule(1, 'wake'),
          },
        }
      ),
    })
    const ask = (/** @type {string} */ port, /** @type {string} */ method) =>
      run.inject({ node: 'api', port, method })
    const replies = [
      ask('side', 'bare'),
      ask('in', 'bare'),
      ask('in', 'secret'),
      ask('in', 'lonely'),
      ask('in', 'broken'),
    ]
    ask('in', 'later')
    await run.runToEnd()
    assert.deepEqual(
      replies.map(r => r.error?.code),
      [
        'E_PORT_NOT_FOUND',
        'E_METHOD_UNKNOWN',
        'E_METHOD_UNKNOWN',
        'E_SIM_NO_EDGE',
        'E_METHOD_FAILED',
      ]
    )
    assert.match(String(replies[4].error?.message), /api threw: boom/)
    const wake = run.spans.find(s => s.kind === 'timer')
    assert.deepEqual(
      [wake?.status, wake?.code],
      ['error', 'E_METHOD_UNKNOWN'],
      'a timer needs onTimer'
    )

    const nowhere = runOf({})
    nowhere.inject({ node: 'ghost', port: 'in', method: 'get' })
    await assert.rejects(nowhere.runToEnd(), { code: 'E_SIM_COMPONENT_NOT_FOUND' })
  })

  it('fails a method that awaits a promise that did not come from ctx with E_BEHAVIOUR_AWAIT', async () => {
    const run = runOf({
      api: component(
        't.api',
        { ports: [inPort('handle')], methods: { public: { handle: {} } } },
        {
          public: {
            async handle() {
              await new Promise(() => {})
            },
          },
        }
      ),
    })
    const reply = run.inject({ node: 'api', port: 'in', method: 'handle' })
    await run.runToEnd()
    assert.equal(reply.error?.code, 'E_BEHAVIOUR_AWAIT')
    assert.match(String(reply.error?.message), /handle of api/)
  })
})
