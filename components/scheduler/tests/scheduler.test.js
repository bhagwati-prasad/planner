// @ts-check
// Self-tests of the starter scheduler (task 0411, spec §9): it fires on its five-field cron
// expression in simulated time, from the Unix epoch in UTC; moves each run by its jitter; keeps
// to its concurrency policy; and misses runs while paused, catching up once when asked.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000
const MINUTE = 60_000
const DAY = 86_400_000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

/**
 * A scheduler in the kernel, its jobs sent to a stub on `out` that records them.
 * @param {Record<string, unknown>} props
 */
function scheduler(props) {
  /** @type {unknown[]} */
  const jobs = []
  const api = runComponent({
    manifest,
    behaviour,
    props: { jobDuration: { kind: 'constant', value: 1000 }, ...props },
    replies: { out: (/** @type {unknown} */ body) => (jobs.push(body), null) },
  })
  const run = api.runUntil
  api.runUntil = async ms => {
    await run(ms)
    for (const m of api.metrics) covered.metrics.add(m.name)
    for (const s of api.spans)
      if (s.node === 'it' && s.kind === 'public') covered.methods.add(s.method)
    for (const s of api.spans) if (s.node === 'it' && s.code) covered.errors.add(s.code)
  }
  return Object.assign(api, { jobs })
}

/** When each run started, in ms. @param {any} api */
const runs = api =>
  api.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === 'runs')
    .map((/** @type {any} */ m) => m.atUs / MS)

/** How many times a metric was reported. @param {any} api @param {string} name */
const count = (api, name) =>
  api.metrics.filter((/** @type {any} */ m) => m.node === 'it' && m.name === name).length

describe('scheduler', () => {
  it('fires on its cron expression in simulated time', async () => {
    const every5 = scheduler({ cron: '*/5 * * * *' })
    await every5.runUntil(60 * MINUTE - 1)
    assert.deepEqual(
      runs(every5),
      Array.from({ length: 12 }, (_, i) => i * 5 * MINUTE)
    )
    assert.equal(every5.jobs.length, 12, 'each run sends its job on out')
    assert.deepEqual(every5.jobs[1], { scheduledAt: 5 * MINUTE, run: 2 })

    const mondays = scheduler({ cron: '30 2 * * 1' })
    await mondays.runUntil(15 * DAY)
    assert.deepEqual(
      runs(mondays),
      [4 * DAY + 150 * MINUTE, 11 * DAY + 150 * MINUTE],
      '1 January 1970 was a Thursday, so the first Monday is the 5th'
    )

    const monthly = scheduler({ cron: '0 0 1 * *' })
    await monthly.runUntil(70 * DAY)
    assert.deepEqual(runs(monthly), [0, 31 * DAY, 59 * DAY], '1 January, 1 February and 1 March')
  })

  it('moves each run later by up to its jitter', async () => {
    const api = scheduler({ cron: '* * * * *', jitter: '10s' })
    await api.runUntil(10 * MINUTE)
    const at = runs(api)
    assert.equal(at.length, 10)
    at.forEach((ms, i) =>
      assert.ok(ms >= i * MINUTE && ms < i * MINUTE + 10_000, `run ${i} at ${ms}`)
    )
    assert.ok(new Set(at.map((ms, i) => ms - i * MINUTE)).size > 1, 'the jitter varies')
  })

  it('keeps to its concurrency policy when a run is still going at the next schedule', async () => {
    /** @param {string} concurrencyPolicy */
    const policy = async concurrencyPolicy => {
      const api = scheduler({
        cron: '* * * * *',
        jobDuration: { kind: 'constant', value: 90_000 },
        concurrencyPolicy,
      })
      await api.runUntil(4 * MINUTE - 1)
      return {
        runs: runs(api).map(ms => ms / MINUTE),
        overlaps: count(api, 'overlaps'),
        missed: count(api, 'missedRuns'),
        finished: count(api, 'duration'),
      }
    }
    assert.deepEqual(await policy('forbid'), { runs: [0, 2], overlaps: 2, missed: 2, finished: 2 })
    assert.deepEqual(await policy('allow'), {
      runs: [0, 1, 2, 3],
      overlaps: 3,
      missed: 0,
      finished: 3,
    })
    assert.deepEqual(
      await policy('replace'),
      { runs: [0, 1, 2, 3], overlaps: 3, missed: 0, finished: 0 },
      'each run replaces the one still going'
    )
  })

  it('misses its schedules while paused, and catches up once on resume when asked', async () => {
    /** @param {boolean} catchUp */
    const pausing = async catchUp => {
      const api = scheduler({ cron: '* * * * *', catchUp })
      api.call('pause', {}, { atMs: 30_000 })
      const refused = api.call('trigger', {}, { atMs: 100_000 })
      api.call('resume', {}, { atMs: 200_000 })
      const manual = api.call('trigger', {}, { atMs: 210_000 })
      await api.runUntil(5 * MINUTE - 1)
      return {
        runs: runs(api),
        missed: count(api, 'missedRuns'),
        refused: refused.error?.code,
        manual: manual.body,
      }
    }
    assert.deepEqual(await pausing(true), {
      runs: [0, 200_000, 210_000, 240_000],
      missed: 3,
      refused: 'PAUSED',
      manual: { run: 3 },
    })
    assert.deepEqual((await pausing(false)).runs, [0, 210_000, 240_000])
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
