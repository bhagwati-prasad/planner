// @ts-check
/**
 * The discrete-event kernel (spec §11 "Kernel", eng §13): a simulated clock in integer
 * microseconds and a pooled queue of events ordered by `(timeUs, priority, seq)`, each handled
 * by the handler registered for its type (task 0401). Method dispatch, state and snapshots
 * build on it in tasks 0402–0417.
 */
import { fail } from '../../core/src/index.js'
import { EventQueue } from './queue.js'

/** Bumped whenever a change could alter a run's results; part of every run hash. */
export const ENGINE_VERSION = '0.1.0'

/**
 * @typedef {{ type: string, [key: string]: unknown }} SimEvent
 * @typedef {(event: any, kernel: Kernel) => void} Handler
 */

export class Kernel {
  /** Simulated time of the event being handled, in microseconds. */
  nowUs = 0
  /** Events handled so far. */
  processed = 0
  /** @type {EventQueue<SimEvent>} */
  #queue = new EventQueue()

  /** When the next event is due, in µs, or Infinity when there is none. */
  get nextUs() {
    return this.#queue.nextTimeUs
  }

  /**
   * Schedules an event `delayUs` after now.
   * @param {number} delayUs a non-negative integer
   * @param {SimEvent} event
   * @param {number} [priority] lower runs first among events at the same time
   */
  schedule(delayUs, event, priority = 0) {
    if (!Number.isInteger(delayUs) || delayUs < 0)
      fail('INVALID', `Events are scheduled a whole number of microseconds ahead, not ${delayUs}`)
    this.#queue.push(this.nowUs + delayUs, priority, event)
  }

  /**
   * Handles events in time order until none are left.
   * @param {Record<string, Handler>} handlers by event type
   * @param {{ maxEvents?: number }} [limits]
   */
  run(handlers, { maxEvents = 1_000_000 } = {}) {
    while (this.#queue.size) {
      if (this.processed >= maxEvents) fail('INVALID', `The run stopped after ${maxEvents} events`)
      this.step(handlers)
    }
  }

  /**
   * The clock, the count of events handled and the queue, for a snapshot (task 0413).
   * @returns {{ nowUs: number, processed: number, entries: import('./queue.js').QueuedEvent<SimEvent>[], seq: number }}
   */
  save() {
    return { nowUs: this.nowUs, processed: this.processed, ...this.#queue.save() }
  }

  /**
   * Puts the clock, the count and the queue back as saved.
   * @param {{ nowUs: number, processed: number, entries: import('./queue.js').QueuedEvent<SimEvent>[], seq: number }} saved
   */
  load({ nowUs, processed, entries, seq }) {
    this.nowUs = nowUs
    this.processed = processed
    this.#queue.load({ entries, seq })
  }

  /**
   * Handles the earliest event, if there is one.
   * @param {Record<string, Handler>} handlers by event type
   * @returns {boolean} false when no event was left
   */
  step(handlers) {
    const next = this.#queue.pop()
    if (!next) return false
    this.nowUs = next.timeUs
    this.processed++
    const handler = handlers[next.event.type]
    if (!handler) fail('INVALID', `No handler for simulation event '${next.event.type}'`)
    handler(next.event, this)
    return true
  }
}
