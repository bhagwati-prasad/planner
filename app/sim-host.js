// @ts-check
// The browser's simulation host (spec §18 "Sandbox host: Web Worker (Blob URL)"). The offline
// build loads dist/sim-worker.js, which defines StrataSimWorker.source; a file:// page cannot
// start a worker from a script URL, so the host starts one from a Blob URL, as the app boots, so
// runs work after the network goes away too. The host (the facade's createSimHost) pairs replies
// with requests and stops a worker that stays silent for 2 s (spec §8 "Watchdog").
import { createSimHost } from '../packages/facade/src/index.js'

/**
 * A host for the facade's `simHost` option, or undefined when the worker source is not loaded:
 * then simulations fail with E_SIM_NO_HOST, and the development page needs `npm run build`.
 * @returns {import('../packages/facade/src/sim.js').SimHost|undefined}
 */
export function browserSimHost() {
  const source = /** @type {any} */ (globalThis).StrataSimWorker?.source
  if (typeof source !== 'string') return undefined
  const start = () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    return { url, worker: new Worker(url) }
  }
  // Started as the app boots, so a run loads nothing: WebKit refuses to start a Blob-URL worker
  // once it is offline. A worker the watchdog stops is replaced when the next run starts.
  /** @type {{ url: string, worker: Worker }|null} */
  let early = start()
  return createSimHost({
    spawn: ({ message, error }) => {
      const { url, worker } = early ?? start()
      early = null
      worker.onmessage = event => message(event.data)
      worker.onerror = event => error(new Error(`The simulation worker failed: ${event.message}`))
      return {
        post: (data, transfer = []) => worker.postMessage(data, transfer),
        terminate: () => {
          worker.terminate()
          URL.revokeObjectURL(url)
        },
      }
    },
    scheduler: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: handle => clearTimeout(/** @type {any} */ (handle)),
    },
  })
}
