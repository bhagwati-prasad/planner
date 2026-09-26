// @ts-check
// The logger adapter contract (eng §14): library code logs only through `debug`, `info`,
// `warn` and `error`, each taking a message and optional plain data. `seen` reports what an
// implementation recorded, so the contract checks that every level arrives at its own level.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * @typedef {object} Logger
 * @property {(message: string, data?: object) => void} debug
 * @property {(message: string, data?: object) => void} info
 * @property {(message: string, data?: object) => void} warn
 * @property {(message: string, data?: object) => void} error
 */

const LEVELS = /** @type {const} */ (['debug', 'info', 'warn', 'error'])

/**
 * @param {string} name
 * @param {() => { logger: Logger, seen: () => Array<{ level: string, text: string }> }} make
 */
export function loggerContract(name, make) {
  describe(`logger contract: ${name}`, () => {
    it('accepts a message and data at every level, and keeps the level', () => {
      const { logger, seen } = make()
      for (const level of LEVELS)
        assert.equal(logger[level](`${level} message`, { n: 1 }), undefined)
      const entries = seen()
      assert.deepEqual(
        entries.map(e => e.level),
        [...LEVELS]
      )
      for (const [i, level] of LEVELS.entries())
        assert.match(entries[i].text, new RegExp(`${level} message`))
    })
  })
}
