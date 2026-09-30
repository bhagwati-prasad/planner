// Starts the simulation worker from a Blob URL, as the offline app does, posts protocol
// requests one after another and returns their replies, leaving out heartbeats.

/** @param {object[]} messages */
window.inSandbox = async messages => {
  const url = URL.createObjectURL(
    new Blob([window.StrataSimWorker.source], { type: 'text/javascript' })
  )
  const worker = new Worker(url)
  try {
    const replies = []
    for (const message of messages)
      replies.push(
        await new Promise((resolve, reject) => {
          worker.onmessage = event => {
            if (event.data?.type !== 'heartbeat') resolve(event.data)
          }
          worker.onerror = event => reject(new Error(event.message))
          worker.postMessage(message)
        })
      )
    return replies
  } finally {
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}
