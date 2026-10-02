// @ts-check
// Self-tests of the starter identity provider (task 0427, spec §9): tokens validate until their
// TTL and fail once revoked; local JWT validation cannot see a revocation and spends no rate
// limit, while introspection can and does; the rate limit refuses the rest with 429; and MFA
// step-up challenges a share of logins, which pass with a one-time password.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

const constant = (/** @type {number} */ value) => ({ kind: 'constant', value })

/**
 * An identity provider in the kernel.
 * @param {Record<string, unknown>} props
 */
function provider(props) {
  const api = runComponent({
    manifest,
    behaviour,
    props: {
      tokenIssueLatency: constant(30),
      validationLatency: constant(1),
      mfaStepUpProbability: 0,
      ...props,
    },
  })
  const run = api.runUntil
  api.runUntil = async ms => {
    await run(ms)
    for (const m of api.metrics) covered.metrics.add(m.name)
    for (const s of api.spans)
      if (s.node === 'it' && s.kind === 'public') covered.methods.add(s.method)
    for (const s of api.spans) if (s.node === 'it' && s.code) covered.errors.add(s.code)
  }
  return api
}

/** A reply's body, or its error's code and reason. @param {any} reply */
const outcome = reply =>
  reply.status === 'ok'
    ? reply.body
    : [reply.error?.code, reply.error?.details?.reason].filter(Boolean).join(' ')

/** A metric's values over time, as [ms, value]. @param {any} api @param {string} name */
const series = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

/** Whether a validation says the token is active. @param {any} reply */
const active = reply => reply.body?.active === true

describe('identity provider', () => {
  it('validates a token it issued until its TTL, and fails it once revoked', async () => {
    const idp = provider({ tokenTtl: '10s', validationMode: 'introspection' })
    const ada = idp.call('issueToken', { subject: 'ada' }, { atMs: 0 })
    const bob = idp.call('issueToken', { subject: 'bob' }, { atMs: 0 })
    await idp.runUntil(100)
    assert.equal(ada.atUs, 30 * MS, 'issuing takes its latency')
    const { token } = /** @type {any} */ (ada.body)
    assert.equal(/** @type {any} */ (ada.body).expiresAt, 10_030)
    const validate = (/** @type {unknown} */ t, /** @type {number} */ atMs) =>
      idp.call('validateToken', { token: t }, { atMs })
    const early = validate(token, 1000)
    const late = validate(token, 10_100)
    const revoked = idp.call(
      'revoke',
      { token: /** @type {any} */ (bob.body).token },
      { atMs: 2000 }
    )
    const afterRevoke = validate(/** @type {any} */ (bob.body).token, 3000)
    const forged = validate('tok.99.99999.mallory', 3000)
    await idp.runUntil(20_000)
    assert.deepEqual(outcome(early), { active: true, subject: 'ada', expiresAt: 10_030 })
    assert.equal(early.atUs, 1001 * MS, 'validating takes its latency')
    assert.equal(outcome(late), 'INVALID_TOKEN expired')
    assert.deepEqual(outcome(revoked), { revoked: 1 })
    assert.equal(outcome(afterRevoke), 'INVALID_TOKEN revoked')
    assert.equal(outcome(forged), 'INVALID_TOKEN unknown')
    assert.equal(series(idp, 'authRequests').length, 7)
    assert.equal(series(idp, 'failures').length, 3)
  })

  it('validates a revoked token locally until it expires, spending none of the rate limit', async () => {
    const idp = provider({ tokenTtl: '10s', validationMode: 'local-jwt', rateLimit: '2/s' })
    const issued = idp.call('issueToken', { subject: 'ada' }, { atMs: 0 })
    await idp.runUntil(100)
    const { token } = /** @type {any} */ (issued.body)
    idp.call('revoke', { token }, { atMs: 1000 })
    const checks = Array.from({ length: 10 }, (_, i) =>
      idp.call('validateToken', { token }, { atMs: 2000 + i })
    )
    const expired = idp.call('validateToken', { token }, { atMs: 10_100 })
    await idp.runUntil(20_000)
    assert.ok(checks.every(active), 'a local check cannot see the revocation')
    assert.equal(outcome(expired), 'INVALID_TOKEN expired')
  })

  it('issues within its rate limit each second, and refuses the rest with 429', async () => {
    const idp = provider({ rateLimit: '2/s', validationMode: 'introspection' })
    const logins = Array.from({ length: 5 }, (_, i) =>
      idp.call('issueToken', { subject: `user-${i}` }, { atMs: i * 10 })
    )
    const nextSecond = idp.call('issueToken', { subject: 'late' }, { atMs: 1000 })
    await idp.runUntil(2000)
    assert.deepEqual(
      logins.map(r => r.error?.code ?? r.status),
      ['ok', 'ok', 'TOO_MANY_REQUESTS', 'TOO_MANY_REQUESTS', 'TOO_MANY_REQUESTS']
    )
    assert.deepEqual(logins[2].error?.details, { status: 429, limit: 2 })
    assert.equal(nextSecond.status, 'ok')
  })

  it('challenges a share of logins with MFA, which pass when they answer with a one-time password', async () => {
    const idp = provider({ mfaStepUpProbability: 100 })
    const first = idp.call('issueToken', { subject: 'ada' }, { atMs: 0 })
    const again = idp.call('issueToken', { subject: 'ada' }, { atMs: 100 })
    const answered = idp.call('issueToken', { subject: 'ada', otp: '123456' }, { atMs: 200 })
    const stranger = idp.call('issueToken', { subject: 'bob', otp: '123456' }, { atMs: 300 })
    await idp.runUntil(1000)
    assert.equal(outcome(first), 'MFA_REQUIRED')
    assert.equal(outcome(again), 'MFA_REQUIRED', 'until the challenge is answered')
    assert.equal(/** @type {any} */ (answered.body)?.subject, 'ada')
    assert.equal(
      outcome(stranger),
      'MFA_REQUIRED',
      'a password with no challenge open is no answer'
    )

    const some = provider({ mfaStepUpProbability: 25, rateLimit: '1000/s' })
    const logins = Array.from({ length: 400 }, (_, i) =>
      some.call('issueToken', { subject: `user-${i}` }, { atMs: i })
    )
    await some.runUntil(2000)
    const challenged = logins.filter(r => r.error?.code === 'MFA_REQUIRED').length
    assert.ok(Math.abs(challenged - 100) < 25, `${challenged} of 400 logins challenged`)
  })

  it('revokes every token of a subject at once', async () => {
    const idp = provider({ validationMode: 'introspection' })
    const tokens = [0, 10, 20].map(atMs =>
      idp.call('issueToken', { subject: atMs < 20 ? 'ada' : 'bob' }, { atMs })
    )
    await idp.runUntil(100)
    const revoked = idp.call('revoke', { subject: 'ada' }, { atMs: 200 })
    const checks = tokens.map(t =>
      idp.call('validateToken', { token: /** @type {any} */ (t.body).token }, { atMs: 300 })
    )
    await idp.runUntil(1000)
    assert.deepEqual(outcome(revoked), { revoked: 2 })
    assert.deepEqual(checks.map(active), [false, false, true])
  })

  it('covers every public method, every declared error and every metric it declares', () => {
    const declared = Object.entries(manifest.methods.public)
    assert.deepEqual([...covered.methods].sort(), declared.map(([name]) => name).sort())
    const errors = new Set(declared.flatMap(([, method]) => method.errors ?? []))
    assert.deepEqual(
      [...covered.errors].filter(code => errors.has(code)).sort(),
      [...errors].sort()
    )
    const reported = Object.keys(manifest.metrics).filter(name => !manifest.metrics[name].estimate)
    for (const name of reported) assert.ok(covered.metrics.has(name), `reports ${name}`)
  })
})
