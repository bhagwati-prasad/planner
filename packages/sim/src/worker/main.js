// @ts-check
/**
 * The simulation worker's entry. The build bundles it into one classic script that the app
 * starts from a Blob URL (a file:// page cannot load a worker by URL) and Node runs in
 * `worker_threads` behind a small adapter that provides `postMessage` and `onmessage`.
 */
import { handleMessage } from '../protocol.js'

const scope = /** @type {any} */ (globalThis)
/** @param {{ data: any }} event */
scope.onmessage = event => scope.postMessage(handleMessage(event.data))
