// @ts-check
// The walking skeleton's simulation (task 0009): one request from a client to a service over
// one edge, in the kernel directly and in a worker_threads worker built from the same bundle
// the browser loads from a Blob URL.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROTOCOL_VERSION, handleMessage, simulate } from '../src/index.js'
import { simWorkerSource } from '../../../scripts/build.js'
import { spawnThreadWorker } from '../../server/src/index.js'

const input = () =>
  JSON.parse(readFileSync(new URL('./fixtures/skeleton-run.json', import.meta.url), 'utf8'))

/**
 * Runs one protocol request in a worker_threads worker and returns its reply.
 * @param {unknown} payload
 */
async function inWorkerThread(payload) {
  const spawn = spawnThreadWorker(await simWorkerSource())
  return new Promise((resolve, reject) => {
    const worker = spawn({
      message: reply => {
        worker.terminate()
        resolve(reply)
      },
      error: err => {
        worker.terminate()
        reject(err)
      },
    })
    worker.post({ v: PROTOCOL_VERSION, type: 'run', id: 7, payload })
  })
}

describe('walking skeleton simulation', () => {
  it('in Node the response arrives at the expected simulated time', async () => {
    const reply = await inWorkerThread(input())
    assert.equal(reply.v, PROTOCOL_VERSION)
    assert.equal(reply.type, 'run.result')
    assert.equal(reply.id, 7)
    const { response, trace } = reply.payload
    // 1 ms over the edge, 20 ms in the service, 1 ms back.
    assert.equal(response.atUs, 22_000)
    assert.deepEqual(
      trace.map(t => [t.atUs, t.event, t.message.kind, t.at]),
      [
        [0, 'sent', 'request', 'client'],
        [1_000, 'received', 'request', 'orders'],
        [21_000, 'sent', 'response', 'orders'],
        [22_000, 'received', 'response', 'client'],
      ]
    )
    assert.deepEqual(reply.payload, simulate(input()), 'the worker runs the same kernel')
  })

  it('two runs with the same seed produce the same run hash', () => {
    const first = simulate(input())
    const second = simulate(input())
    assert.match(first.hash, /^[0-9a-f]{64}$/)
    assert.equal(second.hash, first.hash)
    const reseeded = simulate({ ...input(), seed: 43 })
    assert.notEqual(reseeded.hash, first.hash, 'the seed is part of the run')
    assert.equal(reseeded.response.atUs, 22_000, 'fixed latencies do not depend on the seed')
  })

  it('answers a request over an edge that does not exist with a coded error', () => {
    const reply = handleMessage({
      v: PROTOCOL_VERSION,
      type: 'run',
      id: 3,
      payload: { ...input(), request: { edge: 'nope', method: 'GET /' } },
    })
    assert.deepEqual(
      { type: reply.type, id: reply.id, code: reply.payload.code },
      { type: 'error', id: 3, code: 'E_SIM_EDGE_NOT_FOUND' }
    )
  })

  it('refuses a message from another protocol version', () => {
    const reply = handleMessage({ v: PROTOCOL_VERSION + 1, type: 'run', id: 4, payload: input() })
    assert.equal(reply.type, 'error')
    assert.equal(reply.payload.code, 'E_PROTOCOL_VERSION')
  })
})
