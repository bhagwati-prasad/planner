// The browser's simulation host (spec §18 "Sandbox host: Web Worker (Blob URL)"). The offline
// build loads dist/sim-worker.js, which defines StrataSimWorker.source; a file:// page cannot
// start a worker from a script URL, so each run starts one from a Blob URL instead.

/**
 * A host for the facade's `simHost` option, or undefined when the worker source is not loaded
 * (the development page), which leaves the facade's in-thread default in place.
 * @returns {import('../packages/facade/src/sim.js').SimHost|undefined}
 */
export function browserSimHost() {
  const source = /** @type {any} */ (globalThis).StrataSimWorker?.source
  if (typeof source !== 'string') return undefined
  return {
    request: message =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
        const worker = new Worker(url)
        const done = () => {
          worker.terminate()
          URL.revokeObjectURL(url)
        }
        worker.onmessage = event => {
          done()
          resolve(event.data)
        }
        worker.onerror = event => {
          done()
          reject(new Error(`The simulation worker failed: ${event.message}`))
        }
        worker.postMessage(message)
      }),
  }
}
