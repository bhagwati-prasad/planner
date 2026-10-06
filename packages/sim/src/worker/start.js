// @ts-check
/**
 * Starts the simulation worker in its global scope: the worker's adapters first, since the
 * sandbox replaces the clock they read, then the sandbox, then a session that answers each
 * message. The worker's entry calls it (strata-debug's worker.js, which adds the debugger's run
 * controls and reads, ADR 0024). The build bundles that entry into one classic script that the
 * app starts from a Blob URL (a file:// page cannot load a worker by URL) and Node runs in
 * `worker_threads` behind a small adapter that provides `postMessage` and `onmessage`
 * (strata-server's spawnThreadWorker).
 */
import { bootstrap, workerAdapters } from './bootstrap.js'
import { createWorkerSession } from './session.js'

/**
 * @param {any} scope  the worker's global object
 * @param {{ extensions?: import('../sessions.js').Extensions }} [options]
 */
export function startWorker(scope, { extensions } = {}) {
  const send = scope.postMessage
  const adapters = workerAdapters(scope)
  const session = createWorkerSession({
    post: (message, transfer) => send.call(scope, message, transfer),
    sandbox: bootstrap(scope),
    ...adapters,
    extensions,
  })
  /** @param {{ data: any }} event */
  scope.onmessage = event => void session.handle(event.data)
}
