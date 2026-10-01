// @ts-check
// Self-tests of the starter relational DB (task 0410, spec §9, §11 "Functional behaviour"): rows
// written are read back; connections beyond maxConnections wait on the kernel's servers (ADR
// 0020); transactions commit or roll back, lock their rows, deadlock and fail serialization at
// their isolation level; replicas lag; IOPS, storage and lock contention cost; failover.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTestContext, runComponent } from 'strata/testing'
import behaviour from '../index.js'

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
const MS = 1000

/** What the tests exercised, for the coverage test at the end. */
const covered = { methods: new Set(), errors: new Set(), metrics: new Set() }

const constant = (/** @type {number} */ value) => ({ kind: 'constant', value })

/**
 * A database in the kernel, with property values as a person writes them.
 * @param {Record<string, unknown>} [props]
 */
function database(props = {}) {
  const api = runComponent({
    manifest,
    behaviour,
    props: { readLatency: constant(2), writeLatency: constant(5), lockContention: 0, ...props },
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

/** Calls `method` with `body` at `atMs`. @param {any} db @param {string} method @param {unknown} body */
const call = (db, method, body, atMs = 0, sizeBytes = undefined) =>
  db.call(method, body, { atMs, ...(sizeBytes ? { sizeBytes } : {}) })

/** A reply's body, or its error's code. @param {any} reply */
const outcome = reply => (reply.status === 'ok' ? reply.body : reply.error?.code)

/** A metric's values over time, as [ms, value]. @param {any} db @param {string} name */
const series = (db, name) =>
  db.metrics
    .filter((/** @type {any} */ m) => m.node === 'it' && m.name === name)
    .map((/** @type {any} */ m) => [m.atUs / MS, m.value])

const ada = { customer: 'ada', total: 30 }
const bob = { customer: 'bob', total: 12 }

describe('relational DB', () => {
  it('returns a row inserted by insert from a later query, and updates and deletes rows', async () => {
    const db = database()
    const replies = [
      call(db, 'insert', { table: 'orders', row: ada }),
      call(db, 'insert', { table: 'orders', row: bob }),
      call(db, 'query', { table: 'orders', where: { customer: 'ada' } }, 100),
      call(db, 'update', { table: 'orders', where: { id: 1 }, set: { total: 35 } }, 200),
      call(db, 'delete', { table: 'orders', where: { customer: 'bob' } }, 300),
      call(db, 'query', { table: 'orders' }, 400),
      call(db, 'insert', { table: 'orders', row: { id: 1, customer: 'eve' } }, 500),
      call(db, 'query', { table: 'nothing' }, 600),
    ]
    await db.runUntil(1000)
    assert.deepEqual(replies.map(outcome), [
      { id: 1 },
      { id: 2 },
      [{ id: 1, ...ada }],
      { updated: 1 },
      { deleted: 1 },
      [{ id: 1, customer: 'ada', total: 35 }],
      'DUPLICATE_KEY',
      [],
    ])
    assert.equal(series(db, 'writeQps').length, 5)
    assert.equal(series(db, 'readQps').length, 3)
  })

  it('makes queries beyond max connections wait, and reports them as waiting connections', async () => {
    const db = database({ maxConnections: 2, readLatency: constant(100) })
    const replies = [0, 0, 0].map(at => call(db, 'query', { table: 'orders' }, at))
    await db.runUntil(1000)
    assert.deepEqual(
      replies.map(r => r.atUs / MS),
      [100, 100, 200]
    )
    assert.deepEqual(series(db, 'waitingConnections'), [
      [0, 1],
      [100, 0],
    ])
    assert.equal(Math.max(...series(db, 'activeConnections').map(([, n]) => n)), 2)
  })

  it('applies a transaction’s writes only when it commits, and discards them when it rolls back', async () => {
    const db = database()
    const replies = [
      call(db, 'begin', {}, 0),
      call(db, 'insert', { table: 'orders', row: ada, tx: 1 }, 10),
      call(db, 'query', { table: 'orders' }, 20),
      call(db, 'query', { table: 'orders', tx: 1 }, 20),
      call(db, 'commit', { tx: 1 }, 30),
      call(db, 'query', { table: 'orders' }, 40),
      call(db, 'begin', {}, 50),
      call(db, 'insert', { table: 'orders', row: bob, tx: 2 }, 60),
      call(db, 'rollback', { tx: 2 }, 70),
      call(db, 'query', { table: 'orders' }, 80),
      call(db, 'commit', { tx: 2 }, 90),
    ]
    await db.runUntil(1000)
    assert.deepEqual(replies.map(outcome), [
      { tx: 1 },
      { id: 1 },
      [],
      [{ id: 1, ...ada }],
      { committed: 1 },
      [{ id: 1, ...ada }],
      { tx: 2 },
      { id: 2 },
      { rolledBack: 1 },
      [{ id: 1, ...ada }],
      'NO_TRANSACTION',
    ])
  })

  it('makes a write wait for a row another transaction holds, and fails the one that closes a deadlock', async () => {
    const db = database()
    const replies = [
      call(db, 'insert', { table: 'stock', row: { item: 'pen', count: 5 } }, 0),
      call(db, 'insert', { table: 'stock', row: { item: 'ink', count: 5 } }, 0),
      call(db, 'begin', {}, 1),
      call(db, 'begin', {}, 1),
      call(db, 'update', { table: 'stock', where: { id: 1 }, set: { count: 4 }, tx: 1 }, 10),
      call(db, 'update', { table: 'stock', where: { id: 2 }, set: { count: 4 }, tx: 2 }, 10),
      call(db, 'update', { table: 'stock', where: { id: 2 }, set: { count: 3 }, tx: 1 }, 20),
      call(db, 'update', { table: 'stock', where: { id: 1 }, set: { count: 3 }, tx: 2 }, 30),
      call(db, 'commit', { tx: 1 }, 100),
      call(db, 'query', { table: 'stock' }, 200),
    ]
    await db.runUntil(1000)
    assert.deepEqual(replies.slice(4).map(outcome), [
      { updated: 1 },
      { updated: 1 },
      { updated: 1 },
      'DEADLOCK',
      { committed: 2 },
      [
        { id: 1, item: 'pen', count: 4 },
        { id: 2, item: 'ink', count: 3 },
      ],
    ])
    assert.ok(
      replies[6].atUs >= 30 * MS,
      'the first transaction waited until the deadlock freed ink'
    )
    assert.deepEqual(series(db, 'deadlocks'), [[30, 1]])

    const held = database()
    const waits = [
      call(held, 'insert', { table: 'stock', row: { item: 'pen' } }, 0),
      call(held, 'begin', {}, 1),
      call(held, 'update', { table: 'stock', where: { id: 1 }, set: { item: 'nib' }, tx: 1 }, 2),
      call(held, 'delete', { table: 'stock', where: { id: 1 } }, 10),
    ]
    await held.runUntil(60_000)
    assert.deepEqual(
      [outcome(waits[3]), waits[3].atUs / MS],
      ['LOCK_TIMEOUT', 50_015],
      'a lock wait gives up after 50 s, then takes its write latency'
    )
  })

  it('fails a write to a row committed since the transaction began, at repeatable read and above', async () => {
    /** @param {string} isolationLevel */
    const conflict = async isolationLevel => {
      const db = database({ isolationLevel })
      const replies = [
        call(db, 'insert', { table: 'orders', row: ada }, 0),
        call(db, 'begin', {}, 1),
        call(db, 'update', { table: 'orders', where: { id: 1 }, set: { total: 1 } }, 10),
        call(db, 'update', { table: 'orders', where: { id: 1 }, set: { total: 2 }, tx: 1 }, 20),
      ]
      await db.runUntil(1000)
      return outcome(replies[3])
    }
    assert.equal(await conflict('repeatable-read'), 'SERIALIZATION_FAILURE')
    assert.equal(await conflict('serializable'), 'SERIALIZATION_FAILURE')
    assert.deepEqual(await conflict('read-committed'), { updated: 1 })
  })

  it('serves queries from read replicas that apply each write after the replication lag', async () => {
    const db = database({ readReplicas: 1, replicationLag: constant(50) })
    const replies = [
      call(db, 'insert', { table: 'orders', row: ada }, 0),
      call(db, 'query', { table: 'orders' }, 20),
      call(db, 'query', { table: 'orders', primary: true }, 20),
      call(db, 'query', { table: 'orders' }, 60),
    ]
    await db.runUntil(1000)
    assert.deepEqual(replies.slice(1).map(outcome), [[], [{ id: 1, ...ada }], [{ id: 1, ...ada }]])
    assert.deepEqual(series(db, 'replicaLag'), [[50, 50]])
  })

  it('delays operations over its IOPS limit, fills its storage, and makes contended writes wait', async () => {
    const io = database({ iopsLimit: 2 })
    const writes = [0, 0, 0].map(at => call(io, 'insert', { table: 'logs', row: {} }, at))
    await io.runUntil(2000)
    assert.deepEqual(
      writes.map(r => r.atUs / MS),
      [5, 5, 1005],
      'the third waits for the next second'
    )
    assert.equal(series(io, 'iopsUsed').length, 3)

    const full = database({ storageUsed: '20B', storageCapacity: '100B' })
    const stored = [
      call(full, 'insert', { table: 'blobs', row: {} }, 0, 60),
      call(full, 'insert', { table: 'blobs', row: {} }, 10, 60),
    ]
    await full.runUntil(1000)
    assert.deepEqual(
      stored.map(r => r.error?.code ?? r.status),
      ['ok', 'STORAGE_FULL']
    )
    assert.deepEqual(series(full, 'storageUse'), [[0, 0.8]])

    const freed = database({ storageUsed: '0B', storageCapacity: '100B' })
    const steps = [
      call(freed, 'begin', {}, 0),
      call(freed, 'insert', { table: 'blobs', row: {}, tx: 1 }, 1, 60),
      call(freed, 'commit', { tx: 1 }, 2),
      call(freed, 'delete', { table: 'blobs', where: { id: 1 } }, 3),
      call(freed, 'insert', { table: 'blobs', row: {} }, 4, 60),
    ]
    await freed.runUntil(1000)
    assert.deepEqual(
      steps.map(r => r.error?.code ?? r.status),
      ['ok', 'ok', 'ok', 'ok', 'ok'],
      'a row committed in a transaction frees its storage when deleted'
    )

    const contended = database({ lockContention: 1 })
    const slow = call(contended, 'insert', { table: 'orders', row: ada })
    await contended.runUntil(1000)
    assert.equal(slow.atUs, 10 * MS, 'a write that meets a lock waits another write latency')
  })

  it('is unavailable for its failover time after a fault, and drops open transactions', async () => {
    const ctx = /** @type {any} */ (
      createTestContext({ manifest, behaviour, props: { failoverTime: '30s' } })
    )
    await behaviour.public.begin({ body: {} }, ctx)
    behaviour.onFault({ kind: 'node-down' }, ctx)
    const during = await behaviour.public.query({ body: { table: 'orders' } }, ctx)
    ctx.now = 30_000
    const after = await behaviour.public.commit({ body: { tx: 1 } }, ctx)
    assert.deepEqual([during.code, after.code], ['UNAVAILABLE', 'NO_TRANSACTION'])
    for (const f of ctx.failures) covered.errors.add(f.code)
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
