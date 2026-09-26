// @ts-check
/**
 * The kernel's event queue (eng §13 "Event ordering"): a binary heap ordered by
 * `(timeUs, priority, seq)`. `seq` counts insertions, so events at the same time and priority
 * always come out in the order they were scheduled.
 */

/**
 * @template T
 * @typedef {object} QueuedEvent
 * @property {number} timeUs    integer microseconds of simulated time
 * @property {number} priority  lower runs first among events at the same time
 * @property {number} seq       insertion counter
 * @property {T} event
 */

/** @template T */
export class EventQueue {
  /** @type {QueuedEvent<T>[]} */
  #heap = []
  #seq = 0

  get size() {
    return this.#heap.length
  }

  /**
   * @param {number} timeUs
   * @param {number} priority
   * @param {T} event
   */
  push(timeUs, priority, event) {
    const heap = this.#heap
    heap.push({ timeUs, priority, seq: this.#seq++, event })
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!before(heap[i], heap[parent])) break
      ;[heap[i], heap[parent]] = [heap[parent], heap[i]]
      i = parent
    }
  }

  /** The earliest event, removed from the queue. @returns {QueuedEvent<T>|undefined} */
  pop() {
    const heap = this.#heap
    const top = heap[0]
    const last = heap.pop()
    if (heap.length && last) {
      heap[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let first = i
        if (left < heap.length && before(heap[left], heap[first])) first = left
        if (right < heap.length && before(heap[right], heap[first])) first = right
        if (first === i) break
        ;[heap[i], heap[first]] = [heap[first], heap[i]]
        i = first
      }
    }
    return top
  }
}

/** @param {QueuedEvent<any>} a @param {QueuedEvent<any>} b */
function before(a, b) {
  if (a.timeUs !== b.timeUs) return a.timeUs < b.timeUs
  if (a.priority !== b.priority) return a.priority < b.priority
  return a.seq < b.seq
}
