// @ts-check
/**
 * The starter relational DB (spec §9, §11 "Functional behaviour"). Its tables live in typed state:
 * rows by id, which queries read and writes change. Its maxConnections are the kernel's servers
 * (ADR 0020), so calls beyond them wait and are reported as waiting connections.
 *
 * Writes inside a transaction stay private to it until it commits, and lock their rows. A write
 * to a row another transaction holds waits, polling each millisecond, for at most 50 s
 * (LOCK_TIMEOUT); the one whose wait would close a cycle fails with DEADLOCK and its transaction
 * rolls back. At repeatable read and above, a transaction's write to a row committed since it
 * began fails with SERIALIZATION_FAILURE. A write also meets a lock held by work outside the
 * model at lockContention, and waits another write latency.
 *
 * With read replicas, queries outside a transaction read them, unless they ask for the primary;
 * each committed write reaches them after the replication lag, in commit order. Every query and
 * write uses an IO; those over iopsLimit in a second wait for the next. Inserts fill storage.
 * After a fault the DB fails over: it is unavailable for failoverTime, and open transactions are
 * lost.
 */

/** @typedef {any} Ctx @typedef {any} Msg */

/** How often a write waiting on a lock looks again, in ms. */
const LOCK_POLL_MS = 1
/** How long a write waits on a lock before it gives up, in ms (InnoDB's default). */
const LOCK_TIMEOUT_MS = 50_000

/** Whether a row's columns equal every column of `where`. @param {any} row @param {any} where */
const matches = (row, where = {}) =>
  Object.entries(where).every(([col, value]) => row[col] === value)

/**
 * The rows of a table a reader sees, by id: the committed rows, with a transaction's own writes
 * over them.
 * @param {Ctx} ctx @param {string} table @param {any} [tx]
 * @returns {Map<string, any>}
 */
function view(ctx, table, tx) {
  const rows = new Map(
    Object.entries(ctx.state.tables[table] ?? {}).map(([id, entry]) => [id, entry.row])
  )
  for (const op of tx?.ops ?? [])
    if (op.table !== table) continue
    else if (op.row) rows.set(String(op.id), op.row)
    else rows.delete(String(op.id))
  return rows
}

/**
 * Waits for an IO within the IOPS limit: 0 when one is free in this second, or the ms until the
 * next second.
 * @param {Ctx} ctx
 */
function ioWait(ctx) {
  const { state } = ctx
  const second = Math.floor(ctx.now / 1000)
  if (second > state.ioWindow) {
    state.ioWindow = second
    state.ioUsed = 0
  }
  if (state.ioUsed >= ctx.props.iopsLimit) return (second + 1) * 1000 - ctx.now
  state.ioUsed++
  ctx.metric('iopsUsed', 1)
  return 0
}

/** Reports the share of storage used. @param {Ctx} ctx */
const reportStorage = ctx => ctx.metric('storageUse', ctx.state.storage / ctx.props.storageCapacity)

/**
 * Ends a transaction: releases its locks, frees what its inserts reserved and forgets it.
 * @param {Ctx} ctx @param {number} id
 */
function end(ctx, id) {
  const { state } = ctx
  for (const [key, holder] of Object.entries(state.locks))
    if (holder === id) delete state.locks[key]
  for (const op of state.transactions[id]?.ops ?? []) if (op.size) state.storage -= op.size
  delete state.transactions[id]
  delete state.waitsFor[id]
}

/**
 * Commits writes: applies each to its table now, and sends it to the read replicas.
 * @param {Ctx} ctx @param {any[]} ops
 */
function apply(ctx, ops) {
  const { state, props } = ctx
  for (const op of ops) {
    const rows = (state.tables[op.table] ??= {})
    if (op.row) rows[op.id] = { row: op.row, at: ctx.now, size: op.size ?? rows[op.id]?.size ?? 0 }
    else {
      state.storage -= rows[op.id]?.size ?? 0
      delete rows[op.id]
    }
    if (props.readReplicas > 0) {
      const at = Math.max(ctx.now + ctx.sample(props.replicationLag), state.replicatedUntil)
      state.replicatedUntil = at
      ctx.schedule(at - ctx.now, 'replicate', { op, committedAt: ctx.now })
    }
  }
}

/**
 * A write statement: it finds its rows, takes their locks, waiting while another transaction
 * holds them, then buffers its changes in its transaction, or commits them at once.
 * @param {Msg} msg @param {Ctx} ctx @param {'insert'|'update'|'delete'} kind
 */
async function write(msg, ctx, kind) {
  const { props, state } = ctx
  const body = msg.body ?? {}
  const { table, where, set, tx: txId } = body
  ctx.metric('writeQps', 1)
  const refused = ctx.call('acquireConnection', { tx: txId })
  if (refused) return ctx.fail(refused.code, refused.details)
  for (let wait = ioWait(ctx); wait > 0; wait = ioWait(ctx)) await ctx.spend(wait)
  if (ctx.random() < props.lockContention) await ctx.spend(ctx.sample(props.writeLatency))
  let size = 0
  /** @type {any[]} */
  let ids
  if (kind === 'insert') {
    const given = body.row?.id
    const next = (state.nextId[table] ?? 0) + 1
    const id = given ?? next
    if (view(ctx, table, state.transactions[txId]).has(String(id)))
      return ctx.fail('DUPLICATE_KEY', { table, id })
    size = msg.sizeBytes ?? 0
    if (state.storage + size > props.storageCapacity)
      return ctx.fail('STORAGE_FULL', { storage: state.storage, capacity: props.storageCapacity })
    state.nextId[table] = typeof id === 'number' ? Math.max(next - 1, id) : next - 1
    ids = [id]
  } else {
    ids = [...view(ctx, table, state.transactions[txId])]
      .filter(([, row]) => matches(row, where))
      .map(([id]) => id)
  }
  for (const id of ids) {
    const key = `${table}:${id}`
    const from = ctx.now
    for (;;) {
      const outcome = ctx.call('lock', { table, id, tx: txId, waitedMs: ctx.now - from })
      if (outcome === 'acquired' || outcome === 'free') break
      if (outcome !== 'wait') return ctx.fail(outcome, { table, id })
      // Poll until the holder lets go or the wait times out, then try the lock again.
      const holder = state.locks[key]
      while (state.locks[key] === holder && ctx.now - from < LOCK_TIMEOUT_MS)
        await ctx.spend(LOCK_POLL_MS)
    }
  }
  const tx = state.transactions[txId]
  if (txId !== undefined && !tx) return ctx.fail('NO_TRANSACTION', { tx: txId })
  const rows = view(ctx, table, tx)
  const ops = ids
    .filter(id => kind === 'insert' || rows.has(String(id)))
    .map(id =>
      kind === 'insert'
        ? { table, id, row: { id, ...body.row }, size }
        : kind === 'update'
          ? { table, id, row: { ...rows.get(String(id)), ...set } }
          : { table, id, row: null }
    )
  if (kind === 'insert' && rows.has(String(ids[0])))
    return ctx.fail('DUPLICATE_KEY', { table, id: ids[0] })
  state.storage += size
  if (tx) tx.ops.push(...ops)
  else apply(ctx, ops)
  if (size) reportStorage(ctx)
  if (kind === 'insert') return { id: ids[0] }
  return kind === 'update' ? { updated: ops.length } : { deleted: ops.length }
}

export default {
  init(/** @type {Ctx} */ ctx) {
    ctx.state.storage = ctx.props.storageUsed
  },

  public: {
    /** The rows of a table whose columns equal those of `where`, up to `limit`. */
    async query(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { props, state } = ctx
      const { table, where, limit, tx: txId, primary } = msg.body ?? {}
      ctx.metric('readQps', 1)
      const refused = ctx.call('acquireConnection', { tx: txId })
      if (refused) return ctx.fail(refused.code, refused.details)
      for (let wait = ioWait(ctx); wait > 0; wait = ioWait(ctx)) await ctx.spend(wait)
      const fromReplica = txId === undefined && !primary && props.readReplicas > 0
      const rows = fromReplica
        ? Object.values(state.replica[table] ?? {})
        : [...view(ctx, table, state.transactions[txId]).values()]
      const found = rows.filter(row => matches(row, where))
      return limit === undefined ? found : found.slice(0, limit)
    },

    insert: (/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) => write(msg, ctx, 'insert'),
    update: (/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) => write(msg, ctx, 'update'),
    delete: (/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) => write(msg, ctx, 'delete'),

    /** Starts a transaction. */
    begin(/** @type {Msg} */ _msg, /** @type {Ctx} */ ctx) {
      const refused = ctx.call('acquireConnection', {})
      if (refused) return ctx.fail(refused.code, refused.details)
      const tx = ++ctx.state.nextTx
      ctx.state.transactions[tx] = { startedAt: ctx.now, ops: [] }
      return { tx }
    },

    /** Applies a transaction's writes, and releases its locks. */
    commit(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { tx } = msg.body ?? {}
      const refused = ctx.call('acquireConnection', { tx: tx ?? null })
      if (refused) return ctx.fail(refused.code, refused.details)
      const open = ctx.state.transactions[tx]
      const { ops } = open
      apply(ctx, ops)
      open.ops = []
      end(ctx, tx)
      return { committed: ops.length }
    },

    /** Discards a transaction's writes, and releases its locks. */
    rollback(/** @type {Msg} */ msg, /** @type {Ctx} */ ctx) {
      const { tx } = msg.body ?? {}
      const refused = ctx.call('acquireConnection', { tx: tx ?? null })
      if (refused) return ctx.fail(refused.code, refused.details)
      const rolledBack = ctx.state.transactions[tx].ops.length
      end(ctx, tx)
      return { rolledBack }
    },
  },

  private: {
    /**
     * Why a statement cannot run on its connection, if it cannot: the DB is failing over, or it
     * names a transaction that is not open. The kernel's servers are the connections themselves.
     */
    acquireConnection(/** @type {{ tx?: number|null }} */ { tx }, /** @type {Ctx} */ ctx) {
      if (ctx.now < ctx.state.availableAt)
        return { code: 'UNAVAILABLE', details: { until: ctx.state.availableAt } }
      if (tx !== undefined && !(tx !== null && tx in ctx.state.transactions))
        return { code: 'NO_TRANSACTION', details: { tx } }
      return null
    },

    /**
     * Takes a row's lock for a transaction: 'acquired', or 'wait' while another holds it. A write
     * outside a transaction takes no lock, so it gets 'free' once the row is free. It fails with
     * DEADLOCK when its wait would close a cycle, SERIALIZATION_FAILURE at repeatable read and
     * above for a row committed since its transaction began, and LOCK_TIMEOUT after 50 s.
     */
    lock(
      /** @type {{ table: string, id: string|number, tx?: number, waitedMs: number }} */ {
        table,
        id,
        tx,
        waitedMs,
      },
      /** @type {Ctx} */ ctx
    ) {
      const { state, props } = ctx
      if (tx !== undefined && !(tx in state.transactions)) return 'NO_TRANSACTION'
      const key = `${table}:${id}`
      const holder = state.locks[key]
      if (holder !== undefined && holder !== tx) {
        if (waitedMs >= LOCK_TIMEOUT_MS) {
          if (tx !== undefined) delete state.waitsFor[tx]
          return 'LOCK_TIMEOUT'
        }
        if (tx === undefined) return 'wait'
        state.waitsFor[tx] = holder
        let at = holder
        for (let steps = 0; at !== undefined && steps <= state.nextTx; steps++) {
          if (at === tx) {
            end(ctx, tx)
            ctx.metric('deadlocks', 1)
            return 'DEADLOCK'
          }
          at = state.waitsFor[at]
        }
        return 'wait'
      }
      if (tx === undefined) return 'free'
      delete state.waitsFor[tx]
      const strict =
        props.isolationLevel === 'repeatable-read' || props.isolationLevel === 'serializable'
      const committed = state.tables[table]?.[id]
      if (strict && committed && committed.at > state.transactions[tx].startedAt) {
        end(ctx, tx)
        return 'SERIALIZATION_FAILURE'
      }
      state.locks[key] = tx
      return 'acquired'
    },

    /** Applies a committed write to the read replicas, and reports how far behind they were. */
    replicate(
      /** @type {{ op: any, committedAt: number }} */ { op, committedAt },
      /** @type {Ctx} */ ctx
    ) {
      const rows = (ctx.state.replica[op.table] ??= {})
      if (op.row) rows[op.id] = op.row
      else delete rows[op.id]
      ctx.metric('replicaLag', ctx.now - committedAt)
    },

    /** Fails over: unavailable for failoverTime, losing every open transaction. */
    failover(/** @type {unknown} */ _, /** @type {Ctx} */ ctx) {
      ctx.state.availableAt = ctx.now + ctx.props.failoverTime
      for (const tx of Object.keys(ctx.state.transactions)) end(ctx, Number(tx))
    },
  },

  onTimer(/** @type {{ name: string, data: any }} */ { name, data }, /** @type {Ctx} */ ctx) {
    if (name === 'replicate') ctx.call('replicate', data)
  },

  onFault(/** @type {unknown} */ _fault, /** @type {Ctx} */ ctx) {
    ctx.call('failover')
  },
}
