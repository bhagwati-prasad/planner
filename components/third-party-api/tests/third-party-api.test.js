// @ts-check
// Self-tests of the starter third-party API (task 0411, spec §9): 429 above its rate limit and its
// daily quota, errors at its error rate, unavailability by its SLA and its outage windows, its
// timeout, and the cost of each call.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000
const HOUR = 3_600_000
const DAY = 86_400_000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A third-party API in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} props
 */
function thirdParty(props) {
  const api = runComponent({
    manifest,
    behaviour,
    props: {
      latency: { kind: 'constant', value: 100 },
      errorRate: 0,
      slaAvailability: 100,
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

/** Calls the API at `atMs`. @param {any} api */
const call = (api, atMs = 0) => api.call('call', { q: 1 }, { atMs })

/** @param {any[]} replies */
const outcomes = replies => replies.map(r => r.error?.code ?? r.status)

/** A metric's values. @param {any} api @param {string} name */
const values = (api, name) =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => m.value)

describe('third-party API', () => {
  it('returns 429 above its rate limit', async () => {
    const api = thirdParty({ rateLimit: '5/s' })
    const burst = Array.from({ length: 8 }, (_, i) => call(api, i * 10))
    const later = call(api, 1000)
    await api.runUntil(5000)
    assert.deepEqual(outcomes(burst), [
      ...Array(5).fill('ok'),
      ...Array(3).fill('TOO_MANY_REQUESTS'),
    ])
    assert.deepEqual(burst[7].error?.details, { status: 429, limit: 5 })
    assert.equal(later.status, 'ok', 'the limit is per second')
    assert.equal(values(api, 'tooManyRequests').length, 3)
    assert.deepEqual(burst[0].body, { status: 200 })
  })

  it('returns 429 once its daily quota is spent, until the next day', async () => {
    const api = thirdParty({ dailyQuota: 3 })
    const replies = [0, 1000, 2000, 3000, DAY + 1000].map(at => call(api, at))
    await api.runUntil(2 * DAY)
    assert.deepEqual(outcomes(replies), ['ok', 'ok', 'ok', 'QUOTA_EXCEEDED', 'ok'])
    assert.deepEqual(replies[3].error?.details, { status: 429, quota: 3 })
  })

  it('fails at its error rate, and is unavailable by its SLA and during its outage windows', async () => {
    const flaky = thirdParty({ errorRate: 10, rateLimit: '10000/s' })
    const sla = thirdParty({ slaAvailability: 90, rateLimit: '10000/s' })
    const errors = Array.from({ length: 1000 }, (_, i) => call(flaky, i))
    const down = Array.from({ length: 1000 }, (_, i) => call(sla, i))
    await flaky.runUntil(5000)
    await sla.runUntil(5000)
    const failed = errors.filter(r => r.error?.code === 'ERROR').length
    const unavailable = down.filter(r => r.error?.code === 'UNAVAILABLE').length
    assert.ok(failed > 70 && failed < 130, `${failed} errors at 10 %`)
    assert.ok(unavailable > 70 && unavailable < 130, `${unavailable} unavailable at 90 % SLA`)
    assert.deepEqual(errors.find(r => r.error)?.error?.details, { status: 500 })
    assert.equal(values(flaky, 'errors').length, failed)

    const window = thirdParty({ outageWindows: ['Sun 02:00-03:00 UTC'] })
    const sunday = 3 * DAY
    const replies = [sunday + 2 * HOUR + 1000, sunday + 3 * HOUR + 1000, 2 * HOUR + 1000].map(at =>
      call(window, at)
    )
    await window.runUntil(4 * DAY)
    assert.deepEqual(
      outcomes(replies),
      ['UNAVAILABLE', 'ok', 'ok'],
      '4 January 1970 was a Sunday; the 1st was not'
    )
  })

  it('gives up at its timeout, and charges each call it accepts', async () => {
    const slow = thirdParty({
      latency: { kind: 'constant', value: 500 },
      timeout: '200ms',
      pricePerCall: 0.01,
    })
    const reply = call(slow)
    const throttled = thirdParty({ rateLimit: '1/s', pricePerCall: 0.01 })
    call(throttled)
    call(throttled)
    await slow.runUntil(1000)
    await throttled.runUntil(1000)
    assert.deepEqual(
      [reply.error?.code, reply.error?.details, reply.atUs],
      ['TIMEOUT', { timeoutMs: 200 }, 200 * MS]
    )
    assert.deepEqual(values(slow, 'cost'), [0.01])
    assert.deepEqual(values(throttled, 'cost'), [0.01], 'a refused call costs nothing')
    assert.equal(values(throttled, 'calls').length, 2)
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
