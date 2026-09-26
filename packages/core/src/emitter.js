/**
 * Minimal event emitter. A throwing listener never breaks the emitter or the command that
 * triggered the event: the error goes to `onError`, which by default re-throws it
 * asynchronously so it still surfaces.
 */
export class Emitter {
  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map()
  #onError

  /** @param {{ onError?: (err: unknown, event: string) => void }} [options] */
  constructor({ onError = rethrowLater } = {}) {
    this.#onError = onError
  }

  /**
   * Subscribes to an event; '*' receives every event as (name, data).
   * @param {string} event
   * @param {Function} fn
   * @returns {() => void} unsubscribe
   */
  on(event, fn) {
    if (typeof fn !== 'function') throw new TypeError('Listener must be a function')
    let set = this.#handlers.get(event)
    if (!set) this.#handlers.set(event, (set = new Set()))
    set.add(fn)
    return () => this.off(event, fn)
  }

  /** @param {string} event @param {Function} fn */
  once(event, fn) {
    const off = this.on(event, (...args) => {
      off()
      fn(...args)
    })
    return off
  }

  /** @param {string} event @param {Function} fn */
  off(event, fn) {
    this.#handlers.get(event)?.delete(fn)
  }

  /** @param {string} event @param {unknown} [data] */
  emit(event, data) {
    for (const fn of [...(this.#handlers.get(event) ?? [])]) this.#call(event, fn, data)
    if (event !== '*')
      for (const fn of [...(this.#handlers.get('*') ?? [])]) this.#call(event, fn, event, data)
  }

  #call(event, fn, ...args) {
    try {
      fn(...args)
    } catch (err) {
      this.#onError(err, event)
    }
  }

  /**
   * Hands an error to the error handler, as a throwing listener's is. The command bus reports
   * here when a command a listener queued fails after that listener has returned.
   * @param {unknown} err
   * @param {string} event
   */
  report(err, event) {
    this.#onError(err, event)
  }

  /** @param {string} [event] */
  listenerCount(event) {
    if (event) return this.#handlers.get(event)?.size ?? 0
    let n = 0
    for (const set of this.#handlers.values()) n += set.size
    return n
  }
}

/** @param {unknown} err */
function rethrowLater(err) {
  queueMicrotask(() => {
    throw err
  })
}
