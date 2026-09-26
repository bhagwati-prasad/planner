// @ts-check
// strata.sim for the walking skeleton (tasks 0009, 0010): one request over one edge of a
// system, with the latencies the model's properties give, run by an injected simulation host.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFakeClock, createRandom } from '../../../tools/testing/index.js'
import { createMemoryStorage, createStrata } from '../src/index.js'

/** @param {string} path */
const manifest = path =>
  JSON.parse(readFileSync(new URL(`../../../${path}/manifest.json`, import.meta.url), 'utf8'))

/** A strata with the starter client, service and HTTP types, and a project open. */
async function skeleton(options = {}) {
  const clock = createFakeClock({ start: Date.UTC(2026, 8, 26, 9) })
  const random = createRandom(10)
  const strata = createStrata({
    storage: createMemoryStorage(),
    clock: clock.now,
    random: n => Uint8Array.from({ length: n }, () => random.uint32() & 0xff),
    identity: { id: 'user-1', name: 'Ada' },
    output: () => {},
    ...options,
  })
  for (const path of ['components/client', 'components/service', 'connection-types/http'])
    strata.components.register(manifest(path))
  await strata.projects.create('Skeleton')
  const project = await strata.projects.open('Skeleton')
  const root = project.root
  const client = root.add('client', { name: 'Client' })
  const orders = root.add('service', { name: 'Orders' })
  return { strata, root, client, orders }
}

describe('strata.sim.start', () => {
  it('runs one request over the edge and answers after the latencies the model gives', async () => {
    const { strata, root, client, orders } = await skeleton()
    const edge = root.connect(client.port('out'), orders.port('in'), { type: 'http' })
    const run = await strata.sim.start({ seed: 42 })
    // The HTTP connection's median latency is 1 ms each way; the service's median serviceTime is 20 ms.
    assert.equal(run.response?.atUs, 22_000)
    assert.deepEqual(
      run.trace.map(t => [t.atUs, t.event, t.at, t.message.edge]),
      [
        [0, 'sent', client.id, edge.id],
        [1_000, 'received', orders.id, edge.id],
        [21_000, 'sent', orders.id, edge.id],
        [22_000, 'received', client.id, edge.id],
      ]
    )
    assert.match(run.hash, /^[0-9a-f]{64}$/)
    assert.equal((await strata.sim.start({ seed: 42 })).hash, run.hash)
  })

  it('hands the run to the injected host as a protocol message', async () => {
    /** @type {any[]} */
    const sent = []
    const { strata, root, client, orders } = await skeleton({
      simHost: {
        /** @param {any} message */
        async request(message) {
          sent.push(message)
          return { v: 1, type: 'run.result', id: message.id, payload: { hash: 'from-host' } }
        },
      },
    })
    root.connect(client.port('out'), orders.port('in'), { type: 'http' })
    assert.deepEqual(await strata.sim.start({ seed: 7 }), { hash: 'from-host' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].v, 1)
    assert.equal(sent[0].type, 'run')
    assert.equal(sent[0].payload.seed, 7)
    assert.deepEqual(
      sent[0].payload.model.components.map((/** @type {any} */ c) => [c.name, c.serviceTimeUs]),
      [
        ['Client', 0],
        ['Orders', 20_000],
      ]
    )
  })

  it('fails with E_SIM_NO_EDGE when the system has no edge to send over', async () => {
    const { strata } = await skeleton()
    await assert.rejects(
      () => strata.sim.start(),
      /** @param {any} err */ err => err.code === 'E_SIM_NO_EDGE'
    )
  })

  it('turns an error reply from the host into a StrataError with its code', async () => {
    const { strata, root, client, orders } = await skeleton({
      simHost: {
        /** @param {any} message */
        async request(message) {
          return {
            v: 1,
            type: 'error',
            id: message.id,
            payload: { code: 'E_PROTOCOL_VERSION', message: 'nope' },
          }
        },
      },
    })
    root.connect(client.port('out'), orders.port('in'), { type: 'http' })
    await assert.rejects(
      () => strata.sim.start(),
      /** @param {any} err */ err => err.name === 'StrataError' && err.code === 'E_PROTOCOL_VERSION'
    )
  })
})
