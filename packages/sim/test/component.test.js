// @ts-check
// runComponent (ADR 0020): runs one component in the kernel for its self-tests, which
// strata/testing offers beside createTestContext. Its out ports answer from `replies`, as
// createTestContext's ctx.send does, and its properties are written as a person writes them.
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { runComponent } from '../src/index.js'

const MS = 1000

const manifest = {
  strataApi: '^1.0',
  id: 't.api',
  name: 'API',
  version: '1.0.0',
  extends: 'base:service',
  ports: [
    { name: 'in', direction: 'in', exposes: ['work'] },
    { name: 'out', direction: 'out' },
    { name: 'db', direction: 'out' },
  ],
  methods: { public: { work: {} } },
  properties: {
    pause: { type: 'duration', default: '10ms' },
  },
}

it('runs one component in the kernel, with its out ports answered from replies', async () => {
  const behaviour = {
    public: {
      async work(/** @type {any} */ msg, /** @type {any} */ ctx) {
        let got
        try {
          got = await ctx.send('out', null, msg.body)
        } catch (err) {
          got = `failed: ${/** @type {any} */ (err).code}`
        }
        const row = await ctx.send('db', 'get', {})
        await ctx.spend(ctx.props.pause)
        return { got, row }
      },
    },
  }
  const api = runComponent({
    manifest,
    behaviour,
    props: { instances: 1, concurrency: 1, serviceTime: 0, pause: '20ms' },
    replies: {
      out: (/** @type {any} */ body) => {
        if (body === 'bad') throw Object.assign(new Error('down'), { code: 'UNAVAILABLE' })
        return `stub: ${body}`
      },
      'db.get': 7,
    },
  })
  const first = api.call('work', 'a')
  const second = api.call('work', 'bad')
  const later = api.call('work', 'c', { atMs: 100 })
  await api.runUntil(1000)
  assert.deepEqual([first.body, first.atUs], [{ got: 'stub: a', row: 7 }, 20 * MS])
  assert.deepEqual(
    [second.body, second.atUs],
    [{ got: 'failed: UNAVAILABLE', row: 7 }, 40 * MS],
    'it queued behind the first on the one server'
  )
  assert.equal(later.atUs, 120 * MS)
  assert.equal(api.spans.filter(s => s.node === 'it' && s.method === 'work').length, 3)
  assert.ok(
    api.metrics.some(m => m.name === 'backlog'),
    'the run’s metrics'
  )
})
