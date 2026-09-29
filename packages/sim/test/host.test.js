// @ts-check
// The simulation worker's host and sandbox (task 0402, spec §8 "Sandbox", eng §13 "Worker
// protocol"): the worker strips network globals, makes Math.random seeded and the clock
// simulated, and the host pairs replies with requests, refuses other protocol versions and stops
// a worker that stays silent for 2 s. These run the real worker bundle in worker_threads.
import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { runInThisContext } from 'node:vm'
import { createFakeScheduler } from '../../../tools/testing/index.js'
import * as sim from '../src/index.js'
import * as plugins from '../../plugins/src/index.js'
import * as server from '../../server/src/index.js'
import { simWorkerSource } from '../../../scripts/build.js'

const V = sim.PROTOCOL_VERSION
const PROBE = 'test.probe@1.0.0'
let nextId = 1
/** @type {string} */
let source = ''

before(async () => {
  source = await simWorkerSource()
})

/** The probe component's behaviour as the script the worker loads. */
function probeScript() {
  const dir = new URL('./fixtures/sandbox-probe/', import.meta.url)
  const files = Object.fromEntries(
    readdirSync(dir).map(name => [name, readFileSync(new URL(name, dir), 'utf8')])
  )
  const { bundle, problems } = plugins.packComponent(files, { name: 'sandbox-probe' })
  assert.ok(bundle, JSON.stringify(problems))
  return plugins.behaviourScript(bundle)
}

/** @param {string[]} scripts */
const load = scripts => ({ v: V, type: 'load', id: nextId++, payload: { scripts } })

/** @param {string} method @param {object} [extra] */
const call = (method, extra = {}) => ({
  v: V,
  type: 'call',
  id: nextId++,
  payload: { component: PROBE, node: 'probe-1', method, input: {}, seed: 7, atUs: 0, ...extra },
})

/**
 * A host over worker_threads workers, noting each worker it starts and whether it was stopped.
 * `heartbeat()` resolves with the next heartbeat any worker posts.
 */
function threadHost() {
  const scheduler = createFakeScheduler()
  /** @type {{ terminated: boolean }[]} */
  const workers = []
  /** @type {((message: any) => void)[]} */
  const waiting = []
  /** @param {{ message: (data: any) => void, error: (err: Error) => void }} handlers */
  const spawn = handlers => {
    const seen = { terminated: false }
    workers.push(seen)
    const worker = server.spawnThreadWorker(source)({
      message: data => {
        if (data?.type === 'heartbeat') for (const resolve of waiting.splice(0)) resolve(data)
        handlers.message(data)
      },
      error: handlers.error,
    })
    return {
      post: (/** @type {any} */ message, /** @type {any[]} */ transfer) =>
        worker.post(message, transfer),
      terminate: () => {
        seen.terminated = true
        worker.terminate()
      },
    }
  }
  const host = sim.createSimHost({ spawn, scheduler })
  const heartbeat = () => new Promise(resolve => waiting.push(resolve))
  return { host, scheduler, workers, heartbeat }
}

describe('simulation worker host', () => {
  it('strips fetch, XMLHttpRequest, WebSocket, indexedDB and, after bootstrap, importScripts inside the worker', async () => {
    const { host } = threadHost()
    try {
      const loaded = await host.request(load([probeScript()]))
      assert.equal(loaded.type, 'load.result', JSON.stringify(loaded.payload))
      assert.deepEqual(loaded.payload, { components: [PROBE] })
      const reply = await host.request(call('globals'))
      assert.equal(reply.type, 'call.result', JSON.stringify(reply.payload))
      assert.deepEqual(reply.payload.output, {
        fetch: 'undefined',
        XMLHttpRequest: 'undefined',
        WebSocket: 'undefined',
        EventSource: 'undefined',
        indexedDB: 'undefined',
        caches: 'undefined',
        importScripts: 'undefined',
      })
    } finally {
      host.terminate()
    }
  })

  it('makes Math.random seeded, and Date.now and performance.now simulated', async () => {
    /** @param {number} seed @param {number} atUs */
    const clock = async (seed, atUs) => {
      const { host } = threadHost()
      try {
        await host.request(load([probeScript()]))
        const reply = await host.request(call('clock', { seed, atUs }))
        assert.equal(reply.type, 'call.result', JSON.stringify(reply.payload))
        return reply.payload.output
      } finally {
        host.terminate()
      }
    }
    const stream = sim.createStreams(7).stream('probe-1')
    const expected = [stream.nextU32() / 2 ** 32, stream.nextU32() / 2 ** 32]
    const first = await clock(7, 1_500_000)
    assert.deepEqual(first, { random: expected, dateNow: 1500, performanceNow: 1500 })
    assert.deepEqual(await clock(7, 1_500_000), first, 'the same seed gives the same numbers')
    assert.notDeepEqual((await clock(8, 1_500_000)).random, first.random)
  })

  it('stops a method in an infinite loop after 2 s of silence, and names the method', async () => {
    const { host, scheduler, workers, heartbeat } = threadHost()
    try {
      await host.request(load([probeScript()]))
      const started = heartbeat()
      let settled = false
      const hanging = host.request(call('spin'))
      hanging.then(
        () => (settled = true),
        () => (settled = true)
      )
      assert.deepEqual((await started).payload, { node: 'probe-1', method: 'spin' })
      scheduler.advance(1999)
      await Promise.resolve()
      assert.equal(settled, false, 'still waiting after 1.999 s')
      assert.equal(workers[0].terminated, false)
      scheduler.advance(1)
      await assert.rejects(hanging, err => {
        assert.equal(/** @type {any} */ (err).code, 'E_SIM_METHOD_HUNG')
        assert.match(/** @type {Error} */ (err).message, /'spin' of probe-1/)
        return true
      })
      assert.equal(workers[0].terminated, true, 'the worker is stopped')
      const again = await host.request(load([probeScript()]))
      assert.equal(again.type, 'load.result', 'the next request starts a fresh worker')
      assert.equal(workers.length, 2)
    } finally {
      host.terminate()
    }
  })

  it('rejects messages with an unknown protocol version', async () => {
    const { host } = threadHost()
    try {
      const reply = await host.request({ v: V + 1, type: 'call', id: nextId++, payload: {} })
      assert.equal(reply.type, 'error')
      assert.equal(reply.payload.code, 'E_PROTOCOL_VERSION', 'the worker refuses the request')
    } finally {
      host.terminate()
    }
    const stale = sim.createSimHost({
      scheduler: createFakeScheduler(),
      spawn: ({ message }) => ({
        post: (/** @type {any} */ m) =>
          queueMicrotask(() => message({ ...m, v: V + 1, type: 'call.result' })),
        terminate() {},
      }),
    })
    await assert.rejects(stale.request(call('globals')), { code: 'E_PROTOCOL_VERSION' })
  })
})

describe('worker session', () => {
  it('sends the buffers of typed arrays in a reply as Transferables', async () => {
    /** @type {{ message: any, transfer: unknown[] }[]} */
    const posted = []
    const worker = sim.createWorkerSession({
      post: (message, transfer = []) => posted.push({ message, transfer }),
      sandbox: {
        evaluate(script, define) {
          const scope = /** @type {any} */ (globalThis)
          scope.__strataDefine = define
          try {
            runInThisContext(script)
          } finally {
            delete scope.__strataDefine
          }
        },
        seal() {},
        use() {},
      },
    })
    await worker.handle(load([probeScript()]))
    await worker.handle(call('samples'))
    const reply = posted.find(p => p.message.type === 'call.result')
    const values = reply?.message.payload.output.values
    assert.ok(values instanceof Float64Array, JSON.stringify(posted.map(p => p.message)))
    assert.deepEqual(reply?.transfer, [values.buffer])
  })
})
