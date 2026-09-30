// @ts-check
// The kernel (task 0401, spec §11 "Kernel", eng §13): events ordered by (timeUs, priority, seq),
// one random stream per component, and deterministic log and exp.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gen, property } from '../../../tools/testing/index.js'
import * as sim from '../src/index.js'

const { Kernel, createStreams } = sim

describe('Kernel', () => {
  it('dispatches simultaneous events in insertion order', () => {
    const kernel = new Kernel()
    /** @type {string[]} */
    const order = []
    /** @param {{ name: string, then?: string }} event */
    const note = ({ name, then }) => {
      order.push(`${kernel.nowUs}:${name}`)
      if (then) kernel.schedule(0, { type: 'note', name: then })
    }
    for (const name of ['a', 'b', 'c']) kernel.schedule(5, { type: 'note', name })
    kernel.schedule(5, { type: 'note', name: 'first' }, -1)
    kernel.schedule(0, { type: 'note', name: 'd', then: 'e' })
    kernel.schedule(5, { type: 'note', name: 'f', then: 'g' })
    kernel.run({ note })
    assert.deepEqual(order, ['0:d', '0:e', '5:first', '5:a', '5:b', '5:c', '5:f', '5:g'])
  })

  it('always dispatches random schedules in non-decreasing time order', () => {
    const event = gen.record({
      delay: gen.int(0, 50),
      priority: gen.int(0, 2),
      children: gen.array(gen.record({ delay: gen.int(0, 50), priority: gen.int(0, 2) }), {
        max: 3,
      }),
    })
    property([gen.array(event, { min: 1, max: 40 })], schedule => {
      const kernel = new Kernel()
      /** @type {{ timeUs: number, priority: number, seq: number, queuedAt: number }[]} */
      const handled = []
      let seq = 0
      /** @param {number} delay @param {number} priority @param {object[]} children */
      const add = (delay, priority, children) =>
        kernel.schedule(
          delay,
          { type: 'event', priority, children, seq: seq++, queuedAt: handled.length },
          priority
        )
      /** @param {{ priority: number, seq: number, queuedAt: number, children: any[] }} e */
      const handle = e => {
        handled.push({
          timeUs: kernel.nowUs,
          priority: e.priority,
          seq: e.seq,
          queuedAt: e.queuedAt,
        })
        for (const child of e.children) add(child.delay, child.priority, [])
      }
      for (const e of schedule) add(e.delay, e.priority, e.children)
      kernel.run({ event: handle })
      assert.equal(handled.length, seq, 'every event is dispatched once')
      for (let i = 1; i < handled.length; i++) {
        const [a, b] = [handled[i - 1], handled[i]]
        assert.ok(a.timeUs <= b.timeUs, `time goes back at event ${i}`)
        // Of two simultaneous events both waiting in the queue, the lower priority goes first,
        // then the one scheduled first. An event scheduled by a handler comes after that handler.
        if (a.timeUs === b.timeUs && b.queuedAt < i)
          assert.ok(
            a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq),
            `simultaneous events out of (priority, insertion) order at event ${i}`
          )
      }
    })
  })
})

describe('EventQueue', () => {
  it('pools its entries: the one popped is reused after the next pop', () => {
    const queue = new sim.EventQueue()
    queue.push(1, 0, 'a')
    queue.push(2, 0, 'b')
    const a = queue.pop()
    assert.equal(a?.event, 'a')
    queue.push(3, 0, 'c')
    const b = queue.pop()
    assert.equal(b?.event, 'b')
    assert.notEqual(b, a, 'the entry just popped is still the caller’s')
    queue.push(4, 0, 'd')
    const c = queue.pop()
    const d = queue.pop()
    assert.deepEqual([c?.event, d?.event], ['c', 'd'])
    assert.equal(d, a, 'the entry of a is reused')
    assert.equal(queue.pop(), undefined)
  })
})

describe('createStreams', () => {
  it('keeps each component’s random sequence when another component is added', () => {
    property(
      [gen.int(0, 2 ** 31), gen.string({ min: 1, max: 8 }), gen.string({ min: 1, max: 8 })],
      (seed, id, other) => {
        if (id === other) return
        const alone = createStreams(seed).stream(id)
        const expected = Array.from({ length: 50 }, () => alone.nextU32())

        const streams = createStreams(seed)
        const added = streams.stream(other)
        added.nextU32()
        const stream = streams.stream(id)
        const actual = Array.from({ length: 50 }, () => (added.nextU32(), stream.nextU32()))
        assert.deepEqual(actual, expected)
        assert.notDeepEqual(
          Array.from({ length: 50 }, () => added.nextU32()),
          expected,
          'the added component has its own sequence'
        )
      }
    )
  })
})

/** The bit pattern of a double, as 16 hex digits. @param {number} x */
function bits(x) {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, x)
  return view.getBigUint64(0).toString(16).padStart(16, '0')
}

/** The double with a bit pattern. @param {string} hex */
function double(hex) {
  const view = new DataView(new ArrayBuffer(8))
  view.setBigUint64(0, BigInt(`0x${hex}`))
  return view.getFloat64(0)
}

describe('log and exp', () => {
  it('match the fdlibm reference vectors bit for bit', () => {
    const vectors = JSON.parse(
      readFileSync(new URL('./fixtures/log-exp-vectors.json', import.meta.url), 'utf8')
    )
    const fns = /** @type {Record<string, (x: number) => number>} */ ({
      log: sim.log,
      exp: sim.exp,
    })
    /** @type {string[]} */
    const wrong = []
    for (const name of ['log', 'exp'])
      for (const [input, expected] of vectors[name]) {
        const x = double(input)
        const y = fns[name](x)
        const actual = Number.isNaN(y) ? 'NaN' : bits(y)
        if (actual !== expected) wrong.push(`${name}(${x}) is ${actual}, not ${expected}`)
      }
    assert.deepEqual(wrong, [])
    assert.ok(vectors.log.length >= 80 && vectors.exp.length >= 75)
  })
})
