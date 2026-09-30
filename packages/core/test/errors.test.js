// @ts-check
// StrataError and the error code registry (task 0102, eng §14): every code is registered with a
// description and a user message key, validation returns ok() or err(), and an unregistered
// code is a programmer error that development builds catch at once.
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ERROR_CODES,
  LEGACY_ERROR_CODES,
  StrataError,
  err,
  fail,
  isDevelopment,
  ok,
  setDevelopment,
} from '../src/index.js'

const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
after(() => setDevelopment(true))

describe('StrataError', () => {
  it('creating an error with an unregistered code throws in development builds', () => {
    assert.equal(isDevelopment(), true)
    assert.throws(
      () => new StrataError(/** @type {any} */ ('E_NOT_A_REAL_CODE'), 'Something went wrong'),
      /** @param {any} e */ e =>
        e instanceof StrataError &&
        e.code === 'E_ERROR_CODE_UNREGISTERED' &&
        /E_NOT_A_REAL_CODE/.test(e.message)
    )
    setDevelopment(false)
    const loose = new StrataError(/** @type {any} */ ('E_NOT_A_REAL_CODE'), 'Something went wrong')
    assert.equal(
      loose.code,
      'E_NOT_A_REAL_CODE',
      'production keeps the code rather than failing again'
    )
  })

  it('carries code, message, userMessageKey, details and cause', () => {
    setDevelopment(true)
    const cause = new Error('disk full')
    const error = new StrataError(
      'E_PORT_NOT_FOUND',
      "Port 'p9' not found",
      { portId: 'p9' },
      { cause }
    )
    assert.equal(error.name, 'StrataError')
    assert.equal(error.code, 'E_PORT_NOT_FOUND')
    assert.equal(error.message, "Port 'p9' not found")
    assert.equal(error.userMessageKey, 'errors.E_PORT_NOT_FOUND')
    assert.deepEqual(error.details, { portId: 'p9' })
    assert.equal(error.cause, cause)
    assert.throws(
      () => fail('E_PORT_NOT_FOUND', 'x', { portId: 'p9' }),
      /** @param {any} e */ e => e.userMessageKey === 'errors.E_PORT_NOT_FOUND'
    )
  })
})

describe('ok() and err()', () => {
  it('err() results carry code and plain-data details and serialise to JSON', () => {
    const result = err('E_PORT_NOT_FOUND', { portId: 'p1', tried: ['in', 'out'] })
    assert.deepEqual(result, {
      ok: false,
      code: 'E_PORT_NOT_FOUND',
      details: { portId: 'p1', tried: ['in', 'out'] },
    })
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
    assert.deepEqual(err('E_SIM_NO_EDGE'), { ok: false, code: 'E_SIM_NO_EDGE', details: {} })
    assert.throws(() => err('E_PORT_NOT_FOUND', { at: new Date(0) }), /plain/)
    assert.throws(() => err(/** @type {any} */ ('E_NOPE')), /E_NOPE/)
  })

  it('ok() results carry an optional value', () => {
    assert.deepEqual(ok(), { ok: true })
    assert.deepEqual(ok(42), { ok: true, value: 42 })
  })
})

/** Every code the packages raise: fail('X', …) (but not ctx.fail), new StrataError('X', …) and code: 'E_…'. */
function codesInSource() {
  const codes = new Set()
  for (const pkg of readdirSync(PACKAGES)) {
    const src = join(PACKAGES, pkg, 'src')
    let files = []
    try {
      files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.js'))
    } catch {
      continue
    }
    for (const file of files) {
      const text = readFileSync(join(src, file), 'utf8')
      // `ctx.fail('X')`, a member call however the renamer names `ctx`, answers with a
      // component's own failure code, which its manifest declares (spec §8), not one Strata
      // raises, so it reaches callers as a CallError (task 0403). Strata's `fail` is never a
      // member call.
      for (const [, code] of text.matchAll(/(?<!\.)(?:fail|StrataError|err)\(\s*'([A-Z][A-Z_]+)'/g))
        codes.add(code)
      for (const [, code] of text.matchAll(/code: '(E_[A-Z_]+)'/g)) codes.add(code)
    }
  }
  return [...codes].sort()
}

describe('the error code registry', () => {
  it('every registered code has a description and a user message key', () => {
    const entries = Object.entries(ERROR_CODES)
    assert.ok(entries.length > 0)
    for (const [code, entry] of entries) {
      assert.match(entry.description, /\S{3}/, `${code} has a description`)
      assert.equal(entry.userMessageKey, `errors.${code}`, `${code} has a user message key`)
    }
  })

  it('registers every code the packages raise', () => {
    const missing = codesInSource().filter(code => !(code in ERROR_CODES))
    assert.deepEqual(missing, [])
  })

  it('names codes E_<AREA>_<REASON>, apart from the legacy codes later tasks replace', () => {
    assert.deepEqual(LEGACY_ERROR_CODES, [
      'AMBIGUOUS',
      'CONFLICT',
      'CYCLE',
      'INVALID',
      'NOT_FOUND',
      'NO_ROLLUP_RULE',
      'UNKNOWN_COMMAND',
      'UNSUPPORTED',
    ])
    for (const code of Object.keys(ERROR_CODES))
      if (!LEGACY_ERROR_CODES.includes(code)) assert.match(code, /^E_[A-Z]+(_[A-Z]+)+$/)
  })
})
