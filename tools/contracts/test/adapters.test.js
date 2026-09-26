// @ts-check
// Every adapter implementation against its contract (eng §6, §18): the browser's and Node's
// real adapters, the core's seeded PRNG and ULID factory, and the fakes tests use.
import { createPrng, createUlidFactory } from '../../../packages/core/src/index.js'
import { nodeAdapters } from '../../../packages/cli/src/adapters.js'
import { browserAdapters } from '../../../app/adapters.js'
import {
  createFakeClock,
  createFakeLogger,
  createFakeScheduler,
  createRandom,
} from '../../testing/index.js'
import { clockContract } from '../clock.contract.js'
import { schedulerContract } from '../scheduler.contract.js'
import { prngContract } from '../prng.contract.js'
import { idsContract } from '../ids.contract.js'
import { loggerContract } from '../logger.contract.js'

/** A console stand-in that records which method each call used. */
function recordingConsole() {
  /** @type {Array<{ level: string, text: string }>} */
  const entries = []
  const record =
    (/** @type {string} */ level) =>
    (/** @type {unknown[]} */ ...args) =>
      entries.push({
        level,
        text: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
      })
  return {
    target: {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
      log: record('log'),
    },
    seen: () => entries,
  }
}

/** A writable stand-in for process.stderr that records lines. */
function recordingStream() {
  /** @type {string[]} */
  const lines = []
  return {
    stream: {
      write: (/** @type {string} */ text) => lines.push(...text.split('\n').filter(Boolean)),
    },
    lines,
  }
}

const realScheduler = (/** @type {any} */ scheduler) => ({
  scheduler,
  settle: () => new Promise(resolve => scheduler.setTimeout(resolve, 60)),
})

// Real implementations.
clockContract('browser', () => ({ now: browserAdapters().clock }))
clockContract('Node', () => ({ now: nodeAdapters().clock }))
schedulerContract('browser', () => realScheduler(browserAdapters().scheduler))
schedulerContract('Node', () => realScheduler(nodeAdapters().scheduler))
prngContract('core createPrng', seed => createPrng(seed))
idsContract('browser', () => {
  const { clock, random } = browserAdapters()
  return createUlidFactory({ now: clock, random })
})
idsContract('Node', () => {
  const { clock, random } = nodeAdapters()
  return createUlidFactory({ now: clock, random })
})
loggerContract('browser', () => {
  const { target, seen } = recordingConsole()
  return { logger: browserAdapters({ console: target }).logger, seen }
})
loggerContract('Node', () => {
  const { stream, lines } = recordingStream()
  return {
    logger: nodeAdapters({ stderr: stream }).logger,
    seen: () =>
      lines.map(line => {
        const [, level = '', text = line] = /^\[(\w+)\] (.*)$/.exec(line) ?? []
        return { level, text }
      }),
  }
})

// Fakes.
clockContract('fake', () => {
  const clock = createFakeClock({ start: Date.UTC(2026, 8, 26) })
  return { now: clock.now, tick: () => clock.advance(1) }
})
schedulerContract('fake', () => {
  const scheduler = createFakeScheduler()
  return { scheduler, settle: () => scheduler.runAll() }
})
prngContract('fake createRandom', seed => createRandom(seed))
idsContract('fake', () => {
  const clock = createFakeClock({ start: Date.UTC(2026, 8, 26) })
  return createUlidFactory({ now: clock.now, random: createRandom(5).bytes })
})
loggerContract('fake', () => {
  const logger = createFakeLogger()
  return { logger, seen: () => logger.entries.map(e => ({ level: e.level, text: e.message })) }
})
