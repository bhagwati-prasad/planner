// @ts-check
/**
 * The discrete-event kernel (spec §11 "Kernel", eng §13): a simulated clock in integer
 * microseconds and a queue of events, each handled by the handler registered for its type.
 * It grows into the full kernel in M04 (task 0401).
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
    for (let next = this.#queue.pop(); next; next = this.#queue.pop()) {
      if (this.processed >= maxEvents) fail('INVALID', `The run stopped after ${maxEvents} events`)
      this.nowUs = next.timeUs
      this.processed++
      const handler = handlers[next.event.type]
      if (!handler) fail('INVALID', `No handler for simulation event '${next.event.type}'`)
      handler(next.event, this)
    }
  }
}
