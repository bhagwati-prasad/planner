// @ts-check
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeClock, createFakeScheduler } from '../index.js'

describe('fake scheduler', () => {
  it('runs timers in time order, with no real waiting', () => {
    const clock = createFakeClock({ start: 1000 })
    const scheduler = createFakeScheduler({ clock })
    const ran = []
    const started = process.hrtime.bigint()
    scheduler.setTimeout(() => ran.push(['c', clock.now()]), 3_600_000)
    scheduler.setTimeout(() => ran.push(['a', clock.now()]), 100)
    scheduler.setTimeout(() => {
      ran.push(['b', clock.now()])
      scheduler.setTimeout(() => ran.push(['b2', clock.now()]), 50)
    }, 200)
    scheduler.setTimeout(() => ran.push(['b-same-time', clock.now()]), 200)
    assert.equal(scheduler.pending(), 4)
    scheduler.runAll()
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
    assert.deepEqual(ran, [
      ['a', 1100],
      ['b', 1200],
      ['b-same-time', 1200],
      ['b2', 1250],
      ['c', 3_601_000],
    ])
    assert.equal(clock.now(), 3_601_000)
    assert.equal(scheduler.pending(), 0)
    assert.ok(elapsedMs < 1000, `an hour of timers took ${elapsedMs} ms of real time`)
  })

  it('advances by an amount, running only the timers due', () => {
    const clock = createFakeClock()
    const scheduler = createFakeScheduler({ clock })
    const ran = []
    scheduler.setTimeout(() => ran.push('early'), 10)
    scheduler.setTimeout(() => ran.push('late'), 100)
    scheduler.advance(50)
    assert.deepEqual(ran, ['early'])
    assert.equal(clock.now(), 50)
    scheduler.advance(50)
    assert.deepEqual(ran, ['early', 'late'])
  })

  it('cancels timers and repeats intervals until cleared', () => {
    const clock = createFakeClock()
    const scheduler = createFakeScheduler({ clock })
    const ran = []
    const cancelled = scheduler.setTimeout(() => ran.push('never'), 10)
    scheduler.clearTimeout(cancelled)
    const tick = scheduler.setInterval(() => {
      ran.push(clock.now())
      if (clock.now() >= 30) scheduler.clearInterval(tick)
    }, 10)
    scheduler.runAll()
    assert.deepEqual(ran, [10, 20, 30])
  })

  it('refuses to run away with an endless interval', () => {
    const scheduler = createFakeScheduler({ clock: createFakeClock() })
    scheduler.setInterval(() => {}, 1)
    assert.throws(() => scheduler.runAll({ limit: 100 }), /more than 100 timers/)
  })
})
