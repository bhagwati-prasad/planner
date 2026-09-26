// @ts-check
/**
 * Adapter interfaces (eng §6 "Adapters"). Every capability the core may not reach for itself
 * (time, randomness, timers, logging, storage, the sandbox host) comes from an adapter passed to
 * `createStrata(adapters)` once, at startup. The browser app and the CLI pass real ones
 * (app/adapters.js, packages/cli/src/adapters.js); tests pass the fakes in tools/testing. Each
 * interface has a contract suite in tools/contracts/ that every implementation passes.
 */

/**
 * The clock: current time as integer epoch milliseconds, UTC, never going backwards.
 * @typedef {() => number} Clock
 */

/**
 * A source of random bytes for ids: cryptographically strong in production, seeded in tests.
 * @typedef {(n: number) => Uint8Array} RandomBytes
 */

/**
 * A seeded pseudo-random generator: the same seed gives the same stream on every engine.
 * @typedef {object} Prng
 * @property {() => number} nextU32  an integer in [0, 2^32)
 * @property {() => number} next     a float in [0, 1)
 * @property {(n: number) => Uint8Array} bytes
 */

/**
 * The id generator: ULIDs, unique and in creation order (eng §8).
 * @typedef {() => string} IdGenerator
 */

/**
 * Timers. The kernel never uses them; the UI, autosave and watchdogs do.
 * @typedef {object} Scheduler
 * @property {(fn: () => void, ms: number) => unknown} setTimeout
 * @property {(handle: unknown) => void} clearTimeout
 */

/**
 * The logger: library code logs only through it (eng §14). Data is plain.
 * @typedef {object} Logger
 * @property {(message: string, data?: object) => void} debug
 * @property {(message: string, data?: object) => void} info
 * @property {(message: string, data?: object) => void} warn
 * @property {(message: string, data?: object) => void} error
 */

/**
 * The adapters an environment passes at startup. The clock is required; `random` defaults to
 * the platform's cryptographic source.
 * @typedef {object} Adapters
 * @property {Clock} clock
 * @property {RandomBytes} [random]
 * @property {Scheduler} [scheduler]
 * @property {Logger} [logger]
 * @property {(text: string) => void} [output]  where `print()` and `help()` write
 */

export {}
