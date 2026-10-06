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

/**
 * Runs a planned run to its end in a run session of the simulation worker (ADR 0025) and
 * resolves with its run hash.
 * @param {unknown} input
 */
window.runHash = async input => {
  const { source, protocol } = window.StrataSimWorker
  const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  const waiting = new Map()
  worker.onmessage = ({ data }) => {
    const reply = waiting.get(data.id)
    if (!reply || data.type === 'heartbeat') return
    waiting.delete(data.id)
    if (data.type === 'error') reply.reject(new Error(data.payload.message))
    else reply.resolve(data.payload)
  }
  const ask = (type, payload) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      waiting.set(id, { resolve, reject })
      worker.postMessage({ v: protocol, type, id, payload })
    })
  try {
    const { run } = await ask('run.start', { input })
    await ask('run.control', { run, action: 'runToEnd' })
    return (await ask('run.read', { run, what: 'hash' })).data
  } finally {
    worker.terminate()
    URL.revokeObjectURL(workerUrl)
  }
}
