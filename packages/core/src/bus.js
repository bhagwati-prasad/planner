/**
 * Command bus (spec §16 "Rules that make this possible"): every mutation is a serialisable
 * command `{ type, payload }`. This one path gives undo/redo, the operation log, macros,
 * replay and, in later releases, sync and audit.
 *
 * Each applied command becomes an Operation:
 *   { id, actorId, timestamp, command, payload, inverse, modelRev, ids, meta? }
 * `ids` lists the entity ids the handler allocated, in order, so replaying the operation on
 * another machine produces exactly the same entities. `inverse` is a `model.restore` command
 * holding the previous value of everything the command touched.
 */
import { Tx } from './store.js'
import { didYouMean, fail, suggest } from './errors.js'
import { deepFreeze, isPlainObject, toPlain } from './plain.js'

const TYPE_RE = /^[a-z][\w-]*(?:\.[a-zA-Z][\w-]*)+$|^batch$/

export class CommandBus {
  #store
  #emitter
  #newId
  #clock
  #services
  /** @type {Map<string, HandlerEntry>} */
  #handlers = new Map()
  /** @type {Operation[]} */
  #undo = []
  /** @type {Operation[]} */
  #redo = []
  /** @type {{ ctx: HandlerContext, commands: {type: string, payload: any}[] } | null} */
  #group = null

  /** Every committed operation, oldest first. @type {Operation[]} */
  oplog = []

  /**
   * @param {object} options
   * @param {import('./store.js').Store} options.store
   * @param {import('./emitter.js').Emitter} options.emitter
   * @param {() => string} options.newId
   * @param {() => number} options.clock
   * @param {string} options.actorId
   * @param {Record<string, unknown>} [options.services] extra members for handler contexts (e.g. registry)
   */
  constructor({ store, emitter, newId, clock, actorId, services = {} }) {
    this.#store = store
    this.#emitter = emitter
    this.#newId = newId
    this.#clock = clock
    this.#services = services
    this.actorId = actorId

    this.register('model.restore', restoreHandler, {
      description: 'Writes previously captured entity values back (used by undo and redo)',
      signature: '{ entities: [{ kind, id, value|null }] }',
    })
    this.register('batch', batchHandler, {
      description: 'Applies several commands atomically as one undoable operation',
      signature: '{ commands: [{ type, payload }], label? }',
    })
  }

  /**
   * Registers a command handler. Plugins use the same call as the core.
   * @param {string} type namespaced, e.g. 'component.add'
   * @param {(payload: any, ctx: HandlerContext) => any} handler
   * @param {{ undoable?: boolean, description?: string, signature?: string, replace?: boolean }} [meta]
   */
  register(
    type,
    handler,
    { undoable = true, description = '', signature = '', replace = false } = {}
  ) {
    if (!TYPE_RE.test(type))
      fail('INVALID', `Command type '${type}' must be namespaced, e.g. 'component.add'`)
    if (typeof handler !== 'function') fail('INVALID', `Handler for '${type}' must be a function`)
    if (this.#handlers.has(type) && !replace)
      fail('CONFLICT', `Command '${type}' is already registered`)
    this.#handlers.set(type, { type, handler, undoable, description, signature })
  }

  /** @param {string} type */
  has(type) {
    return this.#handlers.has(type)
  }

  /** Registered commands, sorted by type. */
  commands() {
    return [...this.#handlers.values()]
      .map(({ type, undoable, description, signature }) => ({
        type,
        undoable,
        description,
        signature,
      }))
      .sort((a, b) => a.type.localeCompare(b.type))
  }

  #require(type) {
    const entry = this.#handlers.get(type)
    if (!entry)
      fail(
        'UNKNOWN_COMMAND',
        `Unknown command '${type}'.${didYouMean(suggest(type, this.#handlers.keys()))}`
      )
    return entry
  }

  /** @param {{ ids?: string[], timestamp?: string, actorId?: string }} [options] */
  #context({ ids, timestamp, actorId } = {}) {
    const queue = ids ? [...ids] : null
    /** @type {string[]} */
    const generated = []
    const tx = new Tx(this.#store, {
      actorId: actorId ?? this.actorId,
      timestamp: timestamp ?? new Date(this.#clock()).toISOString(),
    })
    /** @type {HandlerContext} */
    const ctx = {
      ...this.#services,
      tx,
      actorId: tx.actorId,
      timestamp: tx.timestamp,
      newId: () => {
        const id = queue && queue.length ? /** @type {string} */ (queue.shift()) : this.#newId()
        generated.push(id)
        return id
      },
      exec: (type, payload) => this.#require(type).handler(payload, ctx),
    }
    return { ctx, generated, queue }
  }

  /**
   * Applies a command and returns the handler's result. Inside `transaction()` the command
   * joins the open transaction instead of committing on its own.
   * @param {{ type: string, payload?: any }} command
   * @param {DispatchOptions} [options]
   */
  dispatch(command, options = {}) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
      fail('INVALID', 'A command must be an object { type, payload }')
    }
    const entry = this.#require(command.type)
    const payload = toPlain(command.payload ?? {}, `${command.type} payload`)
    if (!isPlainObject(payload)) fail('INVALID', `${command.type} payload must be an object`)

    if (this.#group) {
      const { tx } = this.#group.ctx
      const savepoint = tx.savepoint()
      try {
        const result = entry.handler(payload, this.#group.ctx)
        tx.release(savepoint)
        this.#group.commands.push({ type: command.type, payload })
        return result
      } catch (err) {
        tx.rollbackTo(savepoint)
        throw err
      }
    }

    const { ctx, generated } = this.#context(options)
    let result
    try {
      result = entry.handler(payload, ctx)
    } catch (err) {
      ctx.tx.rollback()
      throw err
    }
    this.#commit(ctx, generated, command.type, payload, entry, options)
    return result
  }

  /**
   * Runs `fn` so that every command it dispatches commits as one `batch` operation (one undo
   * step). If `fn` throws, nothing is applied. `fn` must be synchronous.
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T}
   */
  transaction(fn, { label } = {}) {
    if (this.#group) {
      const group = this.#group
      const savepoint = group.ctx.tx.savepoint()
      const count = group.commands.length
      try {
        const result = fn()
        group.ctx.tx.release(savepoint)
        return result
      } catch (err) {
        group.ctx.tx.rollbackTo(savepoint)
        group.commands.length = count
        throw err
      }
    }
    const { ctx, generated } = this.#context()
    this.#group = { ctx, commands: [] }
    let result
    try {
      result = fn()
      if (result && typeof (/** @type {any} */ (result).then) === 'function') {
        fail('INVALID', 'transaction() callbacks must be synchronous')
      }
    } catch (err) {
      ctx.tx.rollback()
      this.#group = null
      throw err
    }
    const { commands } = this.#group
    this.#group = null
    if (commands.length) {
      const payload = label ? { label, commands } : { commands }
      this.#commit(ctx, generated, 'batch', payload, this.#require('batch'), {})
    }
    return result
  }

  /** True while a transaction is open. */
  get inTransaction() {
    return this.#group !== null
  }

  #commit(ctx, generated, type, payload, entry, options) {
    const { tx } = ctx
    if (!tx.changed) return null
    this.#store.rev += 1
    const op = /** @type {Operation} */ (
      deepFreeze({
        id: options.opId ?? this.#newId(),
        actorId: ctx.actorId,
        timestamp: ctx.timestamp,
        command: type,
        payload,
        inverse: { type: 'model.restore', payload: { entities: tx.inverse() } },
        modelRev: this.#store.rev,
        ids: generated,
        ...(options.meta ? { meta: toPlain(options.meta, 'meta') } : {}),
      })
    )
    this.oplog.push(op)
    const history = options.history ?? (entry.undoable ? 'record' : 'none')
    if (history === 'record') {
      this.#undo.push(op)
      this.#redo.length = 0
    } else if (history === 'undo') {
      this.#redo.push(op)
    } else if (history === 'redo') {
      this.#undo.push(op)
    }
    this.#emitter.emit('op', op)
    this.#emitter.emit('change', { op, changes: tx.changes() })
    if (history !== 'none')
      this.#emitter.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo })
    return op
  }

  get canUndo() {
    return this.#undo.length > 0
  }

  get canRedo() {
    return this.#redo.length > 0
  }

  /** Undoes the most recent undoable operation. Returns the undo operation, or null. */
  undo() {
    return this.#step(this.#undo, 'undo')
  }

  /** Re-applies the most recently undone operation. Returns the redo operation, or null. */
  redo() {
    return this.#step(this.#redo, 'redo')
  }

  #step(stack, direction) {
    if (this.#group) fail('INVALID', `Cannot ${direction} inside a transaction`)
    const op = stack.pop()
    if (!op) return null
    const entry = this.#require('model.restore')
    const payload = toPlain(op.inverse.payload)
    const { ctx, generated } = this.#context()
    try {
      entry.handler(payload, ctx)
    } catch (err) {
      ctx.tx.rollback()
      stack.push(op)
      throw err
    }
    const origin = direction === 'undo' ? op.id : op.meta?.undoOf
    const applied = this.#commit(ctx, generated, 'model.restore', payload, entry, {
      history: direction,
      meta: direction === 'undo' ? { undoOf: origin } : { redoOf: origin },
    })
    if (!applied) this.#emitter.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo })
    this.#emitter.emit(direction, { op, applied })
    return applied
  }

  /** Forgets undo and redo history (the op log is kept). */
  clearHistory() {
    this.#undo.length = 0
    this.#redo.length = 0
    this.#emitter.emit('history', { canUndo: false, canRedo: false })
  }

  /**
   * Re-applies operations recorded elsewhere (crash recovery, another replica). Each one
   * reuses its original ids, timestamp and actor, so the result is identical.
   * @param {Iterable<Operation>} ops
   * @param {{ history?: boolean }} [options] record replayed ops as undoable
   */
  replay(ops, { history = false } = {}) {
    if (this.#group) fail('INVALID', 'Cannot replay inside a transaction')
    const applied = []
    for (const op of ops) {
      const entry = this.#require(op.command)
      const payload = toPlain(op.payload, `${op.command} payload`)
      const { ctx, generated, queue } = this.#context({
        ids: op.ids,
        timestamp: op.timestamp,
        actorId: op.actorId,
      })
      try {
        entry.handler(payload, ctx)
        if ((queue && queue.length) || generated.length !== (op.ids?.length ?? 0)) {
          fail(
            'CONFLICT',
            `Replay of operation ${op.id} (${op.command}) diverged: it allocated ${generated.length} id(s), the original allocated ${op.ids?.length ?? 0}`
          )
        }
      } catch (err) {
        ctx.tx.rollback()
        throw err
      }
      const done = this.#commit(ctx, generated, op.command, payload, entry, {
        opId: op.id,
        meta: op.meta,
        history: history && entry.undoable ? 'record' : 'none',
      })
      if (done) applied.push(done)
    }
    return applied
  }
}

/** @param {{ entities: {kind: string, id: string, value: any}[] }} payload @param {HandlerContext} ctx */
function restoreHandler(payload, ctx) {
  if (!Array.isArray(payload.entities)) fail('INVALID', 'model.restore needs an entities list')
  for (const { kind, id, value } of payload.entities) ctx.tx.restore(kind, id, value ?? null)
}

/** @param {{ commands: {type: string, payload: any}[] }} payload @param {HandlerContext} ctx */
function batchHandler(payload, ctx) {
  if (!Array.isArray(payload.commands)) fail('INVALID', 'batch needs a commands list')
  return payload.commands.map((command, i) => {
    if (!isPlainObject(command) || typeof command.type !== 'string')
      fail('INVALID', `batch.commands[${i}] must be { type, payload }`)
    const sub = toPlain(command.payload ?? {}, `batch.commands[${i}].payload`)
    const result = ctx.exec(command.type, sub)
    payload.commands[i] = { type: command.type, payload: sub }
    return result
  })
}

/**
 * @typedef {object} Operation
 * @property {string} id
 * @property {string} actorId
 * @property {string} timestamp ISO 8601
 * @property {string} command
 * @property {any} payload
 * @property {{ type: 'model.restore', payload: { entities: {kind: string, id: string, value: any}[] } }} inverse
 * @property {number} modelRev
 * @property {string[]} ids
 * @property {{ undoOf?: string, redoOf?: string }} [meta]
 *
 * @typedef {object} HandlerContext
 * @property {import('./store.js').Tx} tx
 * @property {() => string} newId
 * @property {(type: string, payload: any) => any} exec  run another command inside this one
 * @property {string} actorId
 * @property {string} timestamp
 * @property {import('./registry.js').Registry} [registry]
 *
 * @typedef {object} HandlerEntry
 * @property {string} type
 * @property {(payload: any, ctx: HandlerContext) => any} handler
 * @property {boolean} undoable
 * @property {string} description
 * @property {string} signature
 *
 * @typedef {object} DispatchOptions
 * @property {string[]} [ids]        ids to allocate, in order (replay)
 * @property {string} [timestamp]    ISO timestamp to stamp (replay)
 * @property {string} [actorId]      actor to record (replay)
 * @property {string} [opId]         operation id (replay)
 * @property {object} [meta]
 * @property {'record'|'none'} [history]
 */
