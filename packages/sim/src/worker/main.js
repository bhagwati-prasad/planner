// @ts-check
/**
 * The simulation worker's entry. The build bundles it into one classic script that the app
 * starts from a Blob URL (a file:// page cannot load a worker by URL) and Node runs in
 * `worker_threads` behind a small adapter that provides `postMessage` and `onmessage`
 * (strata-server's spawnThreadWorker).
 */
import { bootstrap, workerAdapters } from './bootstrap.js'
import { createWorkerSession } from './session.js'

const scope = /** @type {any} */ (globalThis)
const send = scope.postMessage
// The adapters come first: the sandbox replaces the clock they read.
const adapters = workerAdapters(scope)
const session = createWorkerSession({
  post: (message, transfer) => send.call(scope, message, transfer),
  sandbox: bootstrap(scope),
  ...adapters,
})
/** @param {{ data: any }} event */
scope.onmessage = event => void session.handle(event.data)
