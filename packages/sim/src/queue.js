// @ts-check
/**
 * The kernel's event queue (eng §13 "Event ordering"): a binary heap ordered by
 * `(timeUs, priority, seq)`. `seq` counts insertions, so events at the same time and priority
 * always come out in the order they were scheduled. Entries are pooled (eng §13 "Allocation-free
 * hot loop"): the entry `pop` returns is the caller's until the next `pop`, which takes it back
 * for a later `push` to reuse.
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
  /** @type {QueuedEvent<T>[]} */
  #pool = []
  /** @type {QueuedEvent<T> | undefined} */
  #popped
  #seq = 0

  get size() {
    return this.#heap.length
  }

  /** When the earliest event is due, or Infinity when there is none. */
  get nextTimeUs() {
    return this.#heap[0]?.timeUs ?? Infinity
  }

  /**
   * @param {number} timeUs
   * @param {number} priority
   * @param {T} event
   */
  push(timeUs, priority, event) {
    let entry = this.#pool.pop()
    if (entry) {
      entry.timeUs = timeUs
      entry.priority = priority
      entry.seq = this.#seq++
      entry.event = event
    } else entry = { timeUs, priority, seq: this.#seq++, event }
    const heap = this.#heap
    let i = heap.length
    heap.push(entry)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!before(entry, heap[parent])) break
      heap[i] = heap[parent]
      i = parent
    }
    heap[i] = entry
  }

  /**
   * The earliest event, removed from the queue. Its entry is valid until the next `pop`.
   * @returns {QueuedEvent<T>|undefined}
   */
  pop() {
    if (this.#popped) this.#pool.push(this.#popped)
    const heap = this.#heap
    const top = heap[0]
    const last = heap.pop()
    const n = heap.length
    if (n && last) {
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        if (left >= n) break
        const child = left + 1 < n && before(heap[left + 1], heap[left]) ? left + 1 : left
        if (!before(heap[child], last)) break
        heap[i] = heap[child]
        i = child
      }
      heap[i] = last
    }
    this.#popped = top
    return top
  }

  /** The earliest event, left in the queue, or undefined when there is none. */
  peek() {
    return this.#heap[0]?.event
  }

  /**
   * The queued events in order, with the insertion counter, for a snapshot (task 0413). The
   * entries are copies; their events are the queue's own.
   * @returns {{ entries: QueuedEvent<T>[], seq: number }}
   */
  save() {
    const entries = this.#heap.map(({ timeUs, priority, seq, event }) => ({
      timeUs,
      priority,
      seq,
      event,
    }))
    return { entries: entries.sort((a, b) => (before(a, b) ? -1 : 1)), seq: this.#seq }
  }

  /**
   * Replaces the queue with saved entries, in order, and the insertion counter.
   * @param {{ entries: QueuedEvent<T>[], seq: number }} saved
   */
  load({ entries, seq }) {
    // A sorted array is a valid heap.
    this.#heap = entries.map(({ timeUs, priority, seq: s, event }) => ({
      timeUs,
      priority,
      seq: s,
      event,
    }))
    this.#heap.sort((a, b) => (before(a, b) ? -1 : 1))
    this.#popped = undefined
    this.#seq = seq
  }
}

/** @param {QueuedEvent<any>} a @param {QueuedEvent<any>} b */
function before(a, b) {
  if (a.timeUs !== b.timeUs) return a.timeUs < b.timeUs
  if (a.priority !== b.priority) return a.priority < b.priority
  return a.seq < b.seq
}
