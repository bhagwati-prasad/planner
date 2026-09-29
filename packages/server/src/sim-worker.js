// @ts-check
/**
 * The simulation worker in Node (spec §18 "Sandbox host: worker_threads"): starts the same
 * bundle the browser starts from a Blob URL (`dist/sim-worker.js`) in a `worker_threads` worker,
 * behind a prelude that gives it the browser's `postMessage` and `onmessage`. It is the `spawn`
 * that the facade's `createSimHost` takes.
 */
import { Worker } from 'node:worker_threads'

/**
 * The worker bundle expects a browser worker's messaging globals. The semicolons matter: the
 * bundle starts with `(`, which would otherwise call the last line's result.
 */
const PRELUDE = `const { parentPort } = require('node:worker_threads');
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
parentPort.on('message', data => globalThis.onmessage({ data }));
`

/**
 * @typedef {object} WorkerHandlers
 * @property {(data: any) => void} message  called with each message the worker posts
 * @property {(err: Error) => void} error    called when the worker fails
 *
 * @typedef {object} SpawnedWorker
 * @property {(message: any, transfer?: any[]) => void} post
 * @property {() => void} terminate
 */

/**
 * A function that starts the simulation worker in a `worker_threads` worker.
 * @param {string} source  the worker bundle's script
 * @returns {(handlers: WorkerHandlers) => SpawnedWorker}
 * @example createSimHost({ spawn: spawnThreadWorker(source), scheduler: { setTimeout, clearTimeout } })
 */
export function spawnThreadWorker(source) {
  return ({ message, error }) => {
    const worker = new Worker(PRELUDE + source, { eval: true })
    worker.on('message', message)
    worker.on('error', error)
    return {
      post: (data, transfer) => worker.postMessage(data, transfer),
      terminate: () => void worker.terminate(),
    }
  }
}
