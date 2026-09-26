// The browser's simulation host (spec §18 "Sandbox host: Web Worker (Blob URL)"). The offline
// build loads dist/sim-worker.js, which defines StrataSimWorker.source; a file:// page cannot
// start a worker from a script URL, so the host starts one from a Blob URL. It starts it once,
// when the app boots, and keeps it for every run: a run then never loads a script, which also
// keeps it working when the network goes away after the page has loaded.

/**
 * A host for the facade's `simHost` option, or undefined when the worker source is not loaded
 * (the development page), which leaves the facade's in-thread default in place.
 * @returns {import('../packages/facade/src/sim.js').SimHost|undefined}
 */
export function browserSimHost() {
  const source = /** @type {any} */ (globalThis).StrataSimWorker?.source
  if (typeof source !== 'string') return undefined
  /** @type {Map<unknown, { resolve: (reply: any) => void, reject: (err: Error) => void }>} */
  const pending = new Map()
  /** @type {Worker|null} */
  let worker = null

  const start = () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const started = new Worker(url)
    started.onmessage = event => {
      const waiting = pending.get(event.data?.id)
      pending.delete(event.data?.id)
      waiting?.resolve(event.data)
    }
    started.onerror = event => {
      const error = new Error(`The simulation worker failed: ${event.message}`)
      for (const waiting of pending.values()) waiting.reject(error)
      pending.clear()
      started.terminate()
      URL.revokeObjectURL(url)
      worker = null
    }
    return started
  }
  worker = start()

  return {
    request: message =>
      new Promise((resolve, reject) => {
        pending.set(message.id, { resolve, reject })
        worker ??= start()
        worker.postMessage(message)
      }),
  }
}
