// The behaviour contract (task 0303, spec §8 "Behaviour API", eng §10): checking a behaviour
// module against its manifest, flagging module-level mutable state, and a test context that
// lets component authors unit-test methods without the kernel.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkModuleState, createTestContext, validateBehaviour } from '../src/index.js'

const MANIFEST = {
  strataApi: '^1.0',
  id: 'acme.queue',
  name: 'Queue',
  version: '1.0.0',
  ports: [
    { name: 'in', direction: 'in', exposes: ['publish', 'receive'] },
    { name: 'db', direction: 'out' },
    { name: 'events', direction: 'out' },
  ],
  properties: {
    capacity: { type: 'integer', unit: 'messages', default: 100 },
    retention: { type: 'duration', default: '1s' },
  },
  state: {
    messages: { type: 'queue', of: 'message', initial: [] },
    inFlight: { type: 'map', of: 'message', initial: {} },
  },
  methods: { public: { publish: {}, receive: {} }, private: { expire: {} } },
}

/** The queue behaviour of spec §8, trimmed to what these tests need. */
const queueBehaviour = () => ({
  public: {
    /** @param {any} msg @param {any} ctx */
    publish(msg, ctx) {
      if (ctx.state.messages.length >= ctx.props.capacity)
        return ctx.fail('QUEUE_FULL', { capacity: ctx.props.capacity })
      ctx.state.messages.push({ ...msg.body, enqueuedAt: ctx.now })
      ctx.metric('depth', ctx.state.messages.length)
      return { ok: true }
    },
    /** @param {any} msg @param {any} ctx */
    async receive(msg, ctx) {
      ctx.call('expire')
      const batch = ctx.state.messages.splice(0, msg.body.max)
      for (const m of batch) ctx.state.inFlight[m.id] = m
      const saved = await ctx.send('db', 'insert', { rows: batch.length })
      ctx.emit('events', 'publish', { type: 'Received', count: batch.length })
      return { batch, saved }
    },
  },
  private: {
    /** @param {unknown} _ @param {any} ctx */
    expire(_, ctx) {
      ctx.state.messages = ctx.state.messages.filter(
        (/** @type {any} */ m) => ctx.now - m.enqueuedAt < ctx.props.retention
      )
    },
  },
})

/** @param {import('../src/bundle.js').Problem[]} problems */
const summary = problems => problems.map(p => [p.level, p.code ?? null])

describe('validateBehaviour', () => {
  it('fails a behaviour whose public keys do not match the manifest', () => {
    const behaviour = /** @type {any} */ (queueBehaviour())
    behaviour.public.purge = () => ({ ok: true })
    delete behaviour.public.receive
    const problems = validateBehaviour(behaviour, MANIFEST)
    assert.deepEqual(summary(problems), [
      ['error', 'E_BEHAVIOUR_UNDECLARED_METHOD'],
      ['error', 'E_BEHAVIOUR_MISSING_METHOD'],
    ])
    assert.match(problems[0].message, /public\.purge is not a public method in the manifest/)
    assert.match(problems[1].message, /public method 'receive' has no implementation/)
  })

  it('passes the queue behaviour, and checks its hooks and method kinds', () => {
    assert.deepEqual(validateBehaviour(queueBehaviour(), MANIFEST), [])
    const behaviour = {
      ...queueBehaviour(),
      init: 'start',
      onTimr() {},
      private: { ...queueBehaviour().private, publish() {} },
    }
    const problems = validateBehaviour(behaviour, MANIFEST)
    assert.deepEqual(summary(problems), [
      ['error', 'E_BEHAVIOUR_SHAPE'],
      ['error', 'E_BEHAVIOUR_SHAPE'],
      ['error', 'E_BEHAVIOUR_SHAPE'],
    ])
    const text = problems.map(p => p.message).join('\n')
    assert.match(text, /init must be a function/)
    assert.match(text, /Unknown hook 'onTimr'\. Did you mean 'onTimer'\?/)
    assert.match(text, /'publish' is both public and private/)
  })

  it('only warns about a public method it leaves to the base type', () => {
    const behaviour = /** @type {any} */ (queueBehaviour())
    delete behaviour.public.receive
    const problems = validateBehaviour(behaviour, { ...MANIFEST, extends: 'base:queue' })
    assert.deepEqual(summary(problems), [['warning', null]])
    assert.match(problems[0].message, /'receive'.*base:queue must provide it/)
  })
})

describe('checkModuleState', () => {
  it('flags module-level mutable state and leaves constants and locals alone', () => {
    const source = `import { helper } from './lib/helper.js'
let served = 0
var legacy
export const seen = new Set()
const LIMITS = Object.freeze({ max: 10 })
const DEFAULTS = { retries: 3 }
const cache = {}

export default {
  public: {
    get(msg, ctx) {
      let local = helper(msg)
      local++
      seen.add(msg.id)
      cache[msg.id] = local
      served++
      return DEFAULTS.retries + LIMITS.max
    },
  },
}
`
    const problems = checkModuleState(source, 'index.js')
    assert.deepEqual(
      problems.map(p => [p.level, p.code, p.file, p.line]),
      [
        ['error', 'E_BEHAVIOUR_MODULE_STATE', 'index.js', 2],
        ['error', 'E_BEHAVIOUR_MODULE_STATE', 'index.js', 3],
        ['error', 'E_BEHAVIOUR_MODULE_STATE', 'index.js', 4],
        ['error', 'E_BEHAVIOUR_MODULE_STATE', 'index.js', 7],
      ]
    )
    assert.match(problems[0].message, /'served' is module-level state.*ctx\.state/)
    assert.match(problems[2].message, /'seen' is changed/)
  })
})

describe('createTestContext', () => {
  it('records send, emit, call, fail and state changes for assertions', async () => {
    const behaviour = queueBehaviour()
    const ctx = createTestContext({
      manifest: MANIFEST,
      behaviour,
      props: { capacity: 2 },
      now: 1000,
      replies: { 'db.insert': (/** @type {any} */ args) => ({ id: 7, rows: args.rows }) },
    })
    assert.deepEqual(ctx.props, { capacity: 2, retention: 1000 })
    assert.deepEqual(behaviour.public.publish({ body: { id: 'a' } }, ctx), { ok: true })
    assert.deepEqual(behaviour.public.publish({ body: { id: 'b' } }, ctx), { ok: true })
    assert.deepEqual(behaviour.public.publish({ body: { id: 'c' } }, ctx), {
      ok: false,
      code: 'QUEUE_FULL',
      details: { capacity: 2 },
    })
    assert.deepEqual(await behaviour.public.receive({ body: { max: 1 } }, ctx), {
      batch: [{ id: 'a', enqueuedAt: 1000 }],
      saved: { id: 7, rows: 1 },
    })

    assert.deepEqual(ctx.failures, [{ code: 'QUEUE_FULL', details: { capacity: 2 } }])
    assert.deepEqual(ctx.calls, [{ name: 'expire', args: undefined }])
    assert.deepEqual(ctx.sent, [{ port: 'db', method: 'insert', args: { rows: 1 } }])
    assert.deepEqual(ctx.emitted, [
      { port: 'events', method: 'publish', args: { type: 'Received', count: 1 } },
    ])
    assert.deepEqual(ctx.metrics, [
      { name: 'depth', value: 1 },
      { name: 'depth', value: 2 },
    ])
    const a = { id: 'a', enqueuedAt: 1000 }
    const b = { id: 'b', enqueuedAt: 1000 }
    assert.deepEqual(ctx.changes, [
      { op: 'set', path: ['messages', 0], value: a },
      { op: 'set', path: ['messages', 1], value: b },
      { op: 'set', path: ['messages'], value: [a, b] },
      { op: 'set', path: ['messages', 0], value: b },
      { op: 'delete', path: ['messages', 1] },
      { op: 'set', path: ['inFlight', 'a'], value: a },
    ])
    assert.deepEqual(ctx.snapshot(), { messages: [b], inFlight: { a } })
  })

  it('records a send’s protocol details, and answers a send that names no method by its port', async () => {
    const ctx = createTestContext({
      manifest: MANIFEST,
      replies: { out: (/** @type {any} */ body) => `handled ${body}`, 'db.get': 1 },
    })
    assert.equal(await ctx.send('out', null, 'job'), 'handled job', 'the edge names the method')
    assert.equal(await ctx.send('db', 'get', {}, { path: '/rows/1' }), 1)
    ctx.emit('events', null, 'x', { headers: { key: 'k' } })
    assert.deepEqual(ctx.sent, [
      { port: 'out', method: null, args: 'job' },
      { port: 'db', method: 'get', args: {}, options: { path: '/rows/1' } },
    ])
    assert.deepEqual(ctx.emitted, [
      { port: 'events', method: null, args: 'x', options: { headers: { key: 'k' } } },
    ])
  })

  it('records plain copies of arguments that hold parts of state, as the run does', () => {
    const ctx = createTestContext({
      manifest: MANIFEST,
      behaviour: { private: { hold: (/** @type {any} */ args) => args.item.id } },
    })
    ctx.state.messages.push({ id: 'a' })
    assert.equal(ctx.call('hold', { item: ctx.state.messages[0] }), 'a')
    ctx.schedule(5, 'later', { item: ctx.state.messages[0] })
    assert.deepEqual(ctx.calls, [{ name: 'hold', args: { item: { id: 'a' } } }])
    assert.deepEqual(ctx.scheduled, [{ delay: 5, name: 'later', data: { item: { id: 'a' } } }])
  })

  it('rejects state fields the manifest does not declare, and draws seeded numbers', () => {
    const ctx = createTestContext({ manifest: MANIFEST, seed: 42 })
    assert.throws(
      () => {
        ctx.state.extra = 1
      },
      err => err.code === 'E_BEHAVIOUR_UNDECLARED_STATE' && /state\.extra/.test(err.message)
    )
    const again = createTestContext({ manifest: MANIFEST, seed: 42 })
    const draws = [ctx.random(), ctx.random(), ctx.sample({ kind: 'uniform', min: 10, max: 20 })]
    assert.deepEqual(draws, [
      again.random(),
      again.random(),
      again.sample({ kind: 'uniform', min: 10, max: 20 }),
    ])
    assert.ok(draws[2] >= 10 && draws[2] <= 20)
    assert.equal(ctx.sample(5), 5)
    ctx.schedule(250, 'retry', { id: 'a' })
    ctx.log('warn', 'slow', 3)
    assert.deepEqual(ctx.scheduled, [{ delay: 250, name: 'retry', data: { id: 'a' } }])
    assert.deepEqual(ctx.logs, [{ level: 'warn', args: ['slow', 3] }])
  })
})
