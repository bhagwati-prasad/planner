// The behaviour contract (task 0303, spec §8 "Behaviour API", eng §10): checking a behaviour
// module against its manifest, and flagging module-level mutable state. The test context's tests
// are in packages/sim/test/testing.test.js, beside it.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkModuleState, validateBehaviour } from '../src/index.js'

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
