// Starts the simulation worker from a Blob URL, the way the offline app must (a file:// page
// cannot load a worker script by URL), and runs one protocol request in it.
let nextId = 1

/** @param {unknown} payload */
window.runInWorker = payload =>
  new Promise((resolve, reject) => {
    const { source, protocol } = window.StrataSimWorker
    const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    const done = () => {
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
    }
    worker.onmessage = event => {
      done()
      resolve({ workerUrl, reply: event.data })
    }
    worker.onerror = event => {
      done()
      reject(new Error(event.message))
    }
    worker.postMessage({ v: protocol, type: 'run', id: nextId++, payload })
  })
