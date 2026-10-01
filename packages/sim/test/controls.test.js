// @ts-check
// Run lifecycle and controls (task 0414, spec §12 "Run states", "Controls"): every transition of
// the state diagram, and E_RUN_STATE for every other; stop keeps partial results and restart
// reproduces the run; run to end stops at a breakpoint; speed never changes results; step into
// enters a private call and an expanded composite, and step out leaves them.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeScheduler } from '../../../tools/testing/index.js'
import * as sim from '../src/index.js'

const uniform = (/** @type {number} */ min, /** @type {number} */ max) => ({
  kind: 'uniform',
  min,
  max,
})

/** A component type for these tests. @param {string} id @param {object} rest */
const type = (id, rest) => ({ strataApi: '^1.0', id, name: id, version: '1.0.0', ...rest })

/** A client that orders every 5 to 15 ms from an API that inserts into a database. */
const shop = () => ({
  seed: 3,
  nodes: [
    {
      id: 'client',
      manifest: type('t.client', {
        ports: [{ name: 'out', direction: 'out' }],
        state: { sent: { type: 'integer', initial: 0 } },
        methods: { public: {} },
      }),
      behaviour: {
        init: (/** @type {any} */ ctx) => ctx.schedule(0, 'tick'),
        async onTimer(/** @type {any} */ _timer, /** @type {any} */ ctx) {
          ctx.schedule(5 + ctx.random() * 10, 'tick')
          await ctx.send('out', 'order', { n: ++ctx.state.sent })
        },
      },
    },
    {
      id: 'api',
      manifest: type('t.api', {
        ports: [
          { name: 'in', direction: 'in', exposes: ['order'] },
          { name: 'db', direction: 'out' },
        ],
        state: { orders: { type: 'integer', initial: 0 } },
        methods: { public: { order: {} } },
      }),
      behaviour: {
        public: {
          async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
            await ctx.spend(uniform(1, 8))
            const id = await ctx.send('db', 'insert', { n: msg.body.n })
            ctx.state.orders++
            return { id }
          },
        },
      },
    },
    {
      id: 'db',
      manifest: type('t.db', {
        ports: [{ name: 'in', direction: 'in', exposes: ['insert'] }],
        state: { next: { type: 'integer', initial: 0 } },
        methods: { public: { insert: { latency: uniform(0.5, 2) } } },
      }),
      behaviour: {
        public: { insert: (/** @type {any} */ _msg, /** @type {any} */ ctx) => ++ctx.state.next },
      },
    },
  ],
  edges: [
    {
      id: 'orders',
      from: { node: 'client', port: 'out' },
      to: { node: 'api', port: 'in' },
      props: { latency: uniform(1, 3) },
    },
    {
      id: 'inserts',
      from: { node: 'api', port: 'db' },
      to: { node: 'db', port: 'in' },
      props: { latency: 1 },
    },
  ],
})

/** A control over the shop, lasting a second of simulated time. */
function control(options = {}) {
  const scheduler = createFakeScheduler()
  const c = sim.createControl(shop(), { scheduler, durationMs: 1000, ...options })
  return { c, scheduler }
}

/** Plays until the run leaves the playing state. @param {any} c @param {any} scheduler */
async function playOut(c, scheduler, frames = 100_000) {
  for (let i = 0; i < frames && c.state === 'playing'; i++) {
    scheduler.advance(16)
    await c.idle()
  }
}

/** Whether a promise rejects with E_RUN_STATE. @param {() => Promise<unknown>} action */
const refused = async action =>
  action().then(
    () => false,
    err => err?.code === 'E_RUN_STATE'
  )

describe('run controls', () => {
  it('makes every transition of the state diagram, and refuses every other with E_RUN_STATE', async () => {
    /** Puts a fresh control in a state. @param {string} state */
    const inState = async state => {
      const { c, scheduler } = control()
      if (state === 'ready') return c
      await c.play()
      if (state === 'playing') return c
      if (state === 'stopped') return (await c.stop(), c)
      await c.pause()
      if (state === 'paused') return c
      await c.runToEnd()
      assert.equal(c.state, 'finished')
      return (void scheduler, c)
    }
    /** @type {Record<string, (c: any) => Promise<unknown>>} */
    const actions = {
      play: c => c.play(),
      pause: c => c.pause(),
      stop: c => c.stop(),
      restart: c => c.restart(),
      runToEnd: c => c.runToEnd(),
      step: c => c.step(1, 'event'),
      scrub: c => c.seek({ event: 0 }),
    }
    /** @type {Record<string, Record<string, string>>} the allowed actions, and where they lead */
    const allowed = {
      ready: { play: 'playing' },
      playing: { pause: 'paused', stop: 'stopped', step: 'paused' },
      paused: {
        play: 'playing',
        step: 'paused',
        scrub: 'paused',
        runToEnd: 'finished',
        stop: 'stopped',
      },
      finished: { restart: 'ready' },
      stopped: { restart: 'ready' },
    }
    for (const [state, moves] of Object.entries(allowed))
      for (const [name, act] of Object.entries(actions)) {
        const c = await inState(state)
        if (name in moves) {
          await act(c)
          assert.equal(c.state, moves[name], `${name} from ${state}`)
        } else assert.ok(await refused(() => act(c)), `${name} from ${state} is refused`)
      }

    const { c, scheduler } = control()
    await c.play()
    await playOut(c, scheduler)
    assert.equal(c.state, 'finished', 'playing finishes when the load completes')
    assert.equal(c.run.position.timeUs, 1_000_000)
  })

  it('keeps partial results when stopped, and reproduces the run hash on restart', async () => {
    const { c, scheduler } = control()
    await c.play()
    for (let i = 0; i < 10; i++) {
      scheduler.advance(16)
      await c.idle()
    }
    await c.stop()
    const partial = c.run.spans.length
    assert.ok(partial > 0)
    assert.equal(c.state, 'stopped')
    assert.equal(c.run.spans.length, partial, 'the stopped run is still there to inspect')
    assert.ok(c.run.position.timeUs < 1_000_000)

    await c.restart()
    assert.equal(c.state, 'ready')
    assert.equal(c.run.spans.length, 0, 'a fresh run from time zero')
    await c.play()
    await playOut(c, scheduler)
    const original = c.run.stateHash()
    await c.restart()
    await c.play()
    await c.pause()
    await c.runToEnd()
    assert.equal(c.run.stateHash(), original)
  })

  it('stops a run to end at a breakpoint, and goes on past it when run to end again', async () => {
    const { c } = control()
    await c.play()
    await c.pause()
    c.setBreakpoint({ node: 'db', method: 'insert' })
    await c.runToEnd()
    assert.equal(c.state, 'paused', 'the breakpoint paused it')
    const inserts = () =>
      c.run.spans.filter((/** @type {any} */ s) => s.node === 'db' && s.kind === 'public')
    assert.equal(inserts().length, 0, 'it pauses before the insert arrives')
    await c.runToEnd()
    assert.equal(c.state, 'paused')
    assert.equal(inserts().length, 1, 'the next run to end goes past it, to the next insert')
    c.clearBreakpoints()
    await c.runToEnd()
    assert.equal(c.state, 'finished')
  })

  it('gives the same run at any speed, and when the speed changes as it plays', async () => {
    /** @param {(c: any, scheduler: any) => Promise<void>} drive */
    const hashOf = async drive => {
      const { c, scheduler } = control({ speed: 1 })
      await c.play()
      await drive(c, scheduler)
      assert.equal(c.state, 'finished')
      return c.run.stateHash()
    }
    const normal = await hashOf((c, s) => playOut(c, s))
    const fast = await hashOf(async (c, s) => {
      c.setSpeed(7)
      await playOut(c, s)
    })
    const changing = await hashOf(async (c, s) => {
      c.setSpeed(0.1)
      for (let i = 0; i < 20; i++) {
        s.advance(16)
        await c.idle()
      }
      c.setSpeed(50)
      for (let i = 0; i < 3; i++) {
        s.advance(16)
        await c.idle()
      }
      c.setSpeed(Infinity)
      await playOut(c, s)
    })
    assert.equal(fast, normal)
    assert.equal(changing, normal)
    assert.throws(
      () => control().c.setSpeed(0.01),
      (/** @type {any} */ err) => err.code === 'INVALID'
    )
  })

  it('steps into a private call and an expanded composite, and out of them', async () => {
    const composite = {
      seed: 1,
      nodes: [
        {
          id: 'api',
          manifest: type('t.api', {
            ports: [
              { name: 'in', direction: 'in', exposes: ['order'] },
              { name: 'out', direction: 'out' },
            ],
            methods: { public: { order: {} } },
          }),
          behaviour: {
            public: {
              async order(/** @type {any} */ msg, /** @type {any} */ ctx) {
                const paid = await ctx.send('out', 'pay', msg.body)
                return paid
              },
            },
          },
        },
        {
          id: 'pay',
          manifest: type('t.payments', {
            ports: [{ name: 'in', direction: 'in', exposes: ['pay'] }],
            methods: { public: { pay: {} } },
          }),
          composite: {
            mode: 'expanded',
            bindings: { in: { pay: { node: 'pay/svc', port: 'in', method: 'pay' } } },
            exits: {},
          },
        },
        {
          id: 'pay/svc',
          manifest: type('t.service', {
            ports: [{ name: 'in', direction: 'in', exposes: ['pay'] }],
            methods: { public: { pay: {} }, private: { check: {} } },
          }),
          behaviour: {
            public: {
              async pay(/** @type {any} */ msg, /** @type {any} */ ctx) {
                await ctx.spend(2)
                return { ok: ctx.call('check', msg.body) }
              },
            },
            private: { check: (/** @type {any} */ body) => body.amount < 100 },
          },
        },
      ],
      edges: [
        {
          id: 'payments',
          from: { node: 'api', port: 'out' },
          to: { node: 'pay', port: 'in' },
          props: { latency: 1 },
        },
      ],
    }
    const c = sim.createControl(composite, { scheduler: createFakeScheduler() })
    c.inject({ node: 'api', port: 'in', method: 'order', body: { amount: 5 } })
    await c.play()
    await c.pause()
    await c.step(1, 'event')
    const order = c.run.spans.find((/** @type {any} */ s) => s.node === 'api')
    c.follow(order.traceId)
    /** @param {any} span */
    const frame = span => span && [span.node, span.method, span.kind]
    assert.deepEqual(frame(c.frame), ['api', 'order', 'public'])
    await c.stepInto()
    assert.deepEqual(frame(c.frame), ['pay/svc', 'pay', 'public'], 'into the composite')
    await c.stepInto()
    assert.deepEqual(frame(c.frame), ['pay/svc', 'check', 'private'], 'into the private call')
    await c.stepOut()
    assert.deepEqual(frame(c.frame), ['pay/svc', 'pay', 'public'], 'out of the private call')
    await c.stepOut()
    assert.deepEqual(frame(c.frame), ['api', 'order', 'public'], 'out of the composite')
    assert.equal(c.frame.status, 'running', 'the order waits for its answer from the composite')
    const pay = c.run.spans.find(
      (/** @type {any} */ s) => s.node === 'pay/svc' && s.kind === 'public'
    )
    assert.equal(pay.status, 'ok', 'stepping out ran the payment to its end')
    assert.equal(c.state, 'paused')
  })
})
