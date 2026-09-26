/**
 * Command bus (spec §16 "Rules that make this possible", eng §7): every mutation is a
 * serialisable command `{ type, payload }`. This one path gives undo/redo, the operation log,
 * macros, replay and, in later releases, sync and audit.
 *
 * Dispatch refuses a payload JSON cannot carry (E_COMMAND_PAYLOAD), runs the command's
 * `validate`, which returns `ok()` or `err(code, details)`, then applies its handler through a
 * Tx and commits: `rev` moves on, the operation is logged, and only then are events emitted,
 * including those the handler emitted with `ctx.emit`. A refused or failing command changes
 * nothing and emits nothing. Changes started by an event listener (dispatch, transaction, undo,
 * redo, replay) are queued and run, first in, first out, once every listener has heard the
 * current events, never inside one.
 *
 * Each applied command becomes an Operation, its keys in sorted order so that it serialises to
 * the same JSON wherever it is stored or sent:
 *   { actorId, baseRev, command, id, ids, inverse, meta?, modelRev, payload, timestamp, version }
 * `version` is the command's payload version (eng §7): when a payload shape changes, the
 * command registers the next version with an upgrader from the one before, and replay upgrades
 * older operations (and the commands inside batches) before applying them.
 * `baseRev` is the model revision the command applied to and `modelRev` the one it made.
 * `ids` lists the entity ids the handler allocated, in order, so replaying the operation on
 * another machine produces exactly the same entities. `inverse` is a `model.restore` command
 * holding the previous value of everything the command touched.
 */
import { Tx } from './store.js'
import { StrataError, didYouMean, fail, suggest } from './errors.js'
import { ERROR_CODES } from './errors/codes.js'
import { deepFreeze, isPlainObject, sortKeys, toPlain } from './plain.js'
import { err, ok } from './result.js'

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
  /** @type {{ ctx: HandlerContext, commands: {type: string, version: number, payload: any}[], events: Event[] } | null} */
  #group = null
  /** Changes started by listeners while events were being delivered, to run after them. @type {(() => unknown)[]} */
  #queue = []
  #emitting = false
  #draining = false

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
    this.register('batch', (payload, ctx) => this.#batch(payload, ctx), {
      description: 'Applies several commands atomically as one undoable operation',
      signature: '{ commands: [{ type, version?, payload }], label? }',
    })
  }

  /**
   * Registers a command. Plugins use the same call as the core.
   * @param {string} type namespaced, e.g. 'component.add'
   * @param {(payload: any, ctx: HandlerContext) => any} handler  applies it through `ctx.tx`
   * @param {CommandMeta} [meta]
   */
  register(
    type,
    handler,
    {
      validate,
      version = 1,
      upgrades = {},
      undoable = true,
      description = '',
      signature = '',
      replace = false,
    } = {}
  ) {
    if (!TYPE_RE.test(type))
      fail('INVALID', `Command type '${type}' must be namespaced, e.g. 'component.add'`)
    if (typeof handler !== 'function') fail('INVALID', `Handler for '${type}' must be a function`)
    if (this.#handlers.has(type) && !replace)
      fail('CONFLICT', `Command '${type}' is already registered`)
    for (let v = 1; v < version; v++)
      if (typeof upgrades[v] !== 'function')
        fail(
          'E_COMMAND_VERSION',
          `Command '${type}' is at version ${version} but has no upgrader from version ${v}`,
          { type, version: v }
        )
    this.#handlers.set(type, {
      type,
      handler,
      validate,
      version,
      upgrades,
      undoable,
      description,
      signature,
    })
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
    /** @type {Event[]} */
    const events = []
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
      exec: (type, payload) => this.#apply(this.#require(type), payload, ctx),
      emit: (event, data) => {
        events.push([event, data])
      },
    }
    return { ctx, generated, queue, events }
  }

  /**
   * Validates a command, then applies it. A refusal throws a StrataError with the code and
   * details `validate` returned.
   * @param {HandlerEntry} entry
   * @param {any} payload
   * @param {HandlerContext} ctx
   */
  #apply(entry, payload, ctx) {
    if (entry.validate) {
      const verdict = entry.validate(payload, ctx)
      if (verdict.ok === false)
        fail(
          verdict.code,
          `${entry.type} was refused: ${ERROR_CODES[verdict.code].description}`,
          verdict.details
        )
    }
    return entry.handler(payload, ctx)
  }

  /**
   * Runs a change now and then whatever listeners queued meanwhile; while listeners are hearing
   * events, queues it instead and returns undefined.
   * @template T
   * @param {() => T} fn
   * @returns {T | undefined}
   */
  #enter(fn) {
    if (this.#emitting) {
      this.#queue.push(fn)
      return undefined
    }
    try {
      return fn()
    } finally {
      this.#drain()
    }
  }

  /** Runs queued changes first in, first out. A failure goes to the emitter's error handler. */
  #drain() {
    if (this.#draining || this.#group) return
    this.#draining = true
    try {
      for (let next = this.#queue.shift(); next; next = this.#queue.shift()) {
        try {
          next()
        } catch (error) {
          this.#emitter.report(error, 'queued')
        }
      }
    } finally {
      this.#draining = false
    }
  }

  /** Emits events; changes their listeners start are queued. @param {Event[]} events */
  #publish(events) {
    const outer = this.#emitting
    this.#emitting = true
    try {
      for (const [event, data] of events) this.#emitter.emit(event, data)
    } finally {
      this.#emitting = outer
    }
  }

  /**
   * Applies a command and returns the handler's result; a refused or failing command throws a
   * StrataError and changes nothing. Inside `transaction()` the command joins the open
   * transaction instead of committing on its own. Dispatched by an event listener, it is
   * queued (after its payload is checked) and returns undefined.
   * @param {{ type: string, payload?: any }} command
   * @param {DispatchOptions} [options]
   */
  dispatch(command, options = {}) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
      fail('INVALID', 'A command must be an object { type, payload }')
    }
    const entry = this.#require(command.type)
    const payload = toPlain(command.payload ?? {}, `${command.type} payload`, { strict: true })
    if (!isPlainObject(payload)) fail('INVALID', `${command.type} payload must be an object`)
    return this.#enter(() => this.#dispatch(entry, payload, options))
  }

  /**
   * Like `dispatch`, but a refused or failing command returns `{ ok: false, code, details }`
   * instead of throwing; success returns `{ ok: true, value }` with the handler's result.
   * Errors that are not StrataErrors still throw. A command a listener queues returns
   * `{ ok: true }`, and if it fails later the emitter's error handler hears of it.
   * @param {{ type: string, payload?: any }} command
   * @param {DispatchOptions} [options]
   * @returns {import('./result.js').Ok<any> | import('./result.js').Err}
   */
  tryDispatch(command, options) {
    try {
      return ok(this.dispatch(command, options))
    } catch (error) {
      if (!(error instanceof StrataError)) throw error
      const details = /** @type {Record<string, unknown>} */ (error.details)
      return err(error.code, isPlainObject(details) ? details : {})
    }
  }

  /** @param {HandlerEntry} entry @param {any} payload @param {DispatchOptions} options */
  #dispatch(entry, payload, options) {
    if (this.#group) {
      const { ctx, commands, events } = this.#group
      const savepoint = ctx.tx.savepoint()
      const emitted = events.length
      try {
        const result = this.#apply(entry, payload, ctx)
        ctx.tx.release(savepoint)
        commands.push({ type: entry.type, version: entry.version, payload })
        return result
      } catch (error) {
        ctx.tx.rollbackTo(savepoint)
        events.length = emitted
        throw error
      }
    }

    const { ctx, generated, events } = this.#context(options)
    let result
    try {
      result = this.#apply(entry, payload, ctx)
    } catch (error) {
      ctx.tx.rollback()
      throw error
    }
    this.#publish(this.#commit(ctx, generated, events, entry.type, payload, entry, options).events)
    return result
  }

  /**
   * Runs `fn` so that every command it dispatches commits as one `batch` operation (one undo
   * step). If `fn` throws, nothing is applied. `fn` must be synchronous. Started by an event
   * listener, it is queued and returns undefined.
   * @template T
   * @param {() => T} fn
   * @param {{ label?: string }} [options]
   * @returns {T | undefined}
   */
  transaction(fn, { label } = {}) {
    return this.#enter(() => this.#transaction(fn, label))
  }

  /**
   * @template T
   * @param {() => T} fn
   * @param {string} [label]
   */
  #transaction(fn, label) {
    if (this.#group) {
      const group = this.#group
      const savepoint = group.ctx.tx.savepoint()
      const count = group.commands.length
      const emitted = group.events.length
      try {
        const result = fn()
        group.ctx.tx.release(savepoint)
        return result
      } catch (error) {
        group.ctx.tx.rollbackTo(savepoint)
        group.commands.length = count
        group.events.length = emitted
        throw error
      }
    }
    const { ctx, generated, events } = this.#context()
    this.#group = { ctx, commands: [], events }
    let result
    try {
      result = fn()
      if (result && typeof (/** @type {any} */ (result).then) === 'function') {
        fail('INVALID', 'transaction() callbacks must be synchronous')
      }
    } catch (error) {
      ctx.tx.rollback()
      this.#group = null
      throw error
    }
    const { commands } = this.#group
    this.#group = null
    if (commands.length) {
      const payload = label ? { label, commands } : { commands }
      this.#publish(
        this.#commit(ctx, generated, events, 'batch', payload, this.#require('batch'), {}).events
      )
    }
    return result
  }

  /** True while a transaction is open. */
  get inTransaction() {
    return this.#group !== null
  }

  /**
   * A payload written by `version` of a command, brought up to its current version.
   * @param {HandlerEntry} entry
   * @param {number} version
   * @param {any} payload
   */
  #upgrade(entry, version, payload) {
    if (version > entry.version)
      fail(
        'E_COMMAND_VERSION',
        `'${entry.type}' version ${version} is newer than the version ${entry.version} this build registers`,
        { type: entry.type, version }
      )
    let out = payload
    for (let v = version; v < entry.version; v++)
      out = toPlain(entry.upgrades[v](out), `${entry.type} payload`, { strict: true })
    return out
  }

  /**
   * Applies the commands of a batch in order, each brought up to its command's current version
   * (a command without a version is taken to be current), and records that version.
   * @param {{ commands: {type: string, version?: number, payload?: any}[] }} payload
   * @param {HandlerContext} ctx
   */
  #batch(payload, ctx) {
    if (!Array.isArray(payload.commands)) fail('INVALID', 'batch needs a commands list')
    return payload.commands.map((command, i) => {
      if (!isPlainObject(command) || typeof command.type !== 'string')
        fail('INVALID', `batch.commands[${i}] must be { type, payload }`)
      const entry = this.#require(command.type)
      const sub = this.#upgrade(
        entry,
        command.version ?? entry.version,
        toPlain(command.payload ?? {}, `batch.commands[${i}].payload`)
      )
      const result = this.#apply(entry, sub, ctx)
      payload.commands[i] = { type: entry.type, version: entry.version, payload: sub }
      return result
    })
  }

  /**
   * Commits a transaction as one operation. Returns it (null when nothing changed) with the
   * events to publish: 'op', 'change', those the handlers emitted, then 'history'.
   * @param {HandlerContext} ctx
   * @param {string[]} generated
   * @param {Event[]} emitted
   * @param {string} type
   * @param {any} payload
   * @param {HandlerEntry} entry
   * @param {{ opId?: string, meta?: object, history?: 'record'|'none'|'undo'|'redo' }} options
   * @returns {{ op: Operation | null, events: Event[] }}
   */
  #commit(ctx, generated, emitted, type, payload, entry, options) {
    const { tx } = ctx
    if (!tx.changed) return { op: null, events: [] }
    const baseRev = this.#store.rev
    this.#store.rev += 1
    const op = /** @type {Operation} */ (
      deepFreeze(
        sortKeys({
          id: options.opId ?? this.#newId(),
          actorId: ctx.actorId,
          timestamp: ctx.timestamp,
          command: type,
          version: entry.version,
          payload,
          inverse: { type: 'model.restore', payload: { entities: tx.inverse() } },
          baseRev,
          modelRev: this.#store.rev,
          ids: generated,
          ...(options.meta ? { meta: toPlain(options.meta, 'meta') } : {}),
        })
      )
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
    /** @type {Event[]} */
    const events = [['op', op], ['change', { op, changes: tx.changes() }], ...emitted]
    if (history !== 'none')
      events.push(['history', { canUndo: this.canUndo, canRedo: this.canRedo }])
    return { op, events }
  }

  get canUndo() {
    return this.#undo.length > 0
  }

  get canRedo() {
    return this.#redo.length > 0
  }

  /**
   * Undoes the most recent undoable operation. Returns the undo operation, or null; started
   * by an event listener, it is queued and returns undefined.
   */
  undo() {
    return this.#enter(() => this.#step(this.#undo, 'undo'))
  }

  /**
   * Re-applies the most recently undone operation. Returns the redo operation, or null;
   * started by an event listener, it is queued and returns undefined.
   */
  redo() {
    return this.#enter(() => this.#step(this.#redo, 'redo'))
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
    const { op: applied, events } = this.#commit(
      ctx,
      generated,
      [],
      'model.restore',
      payload,
      entry,
      {
        history: direction,
        meta: direction === 'undo' ? { undoOf: origin } : { redoOf: origin },
      }
    )
    if (!applied) events.push(['history', { canUndo: this.canUndo, canRedo: this.canRedo }])
    events.push([direction, { op, applied }])
    this.#publish(events)
    return applied
  }

  /** Forgets undo and redo history (the op log is kept). */
  clearHistory() {
    this.#undo.length = 0
    this.#redo.length = 0
    this.#publish([['history', { canUndo: false, canRedo: false }]])
  }

  /**
   * Re-applies operations recorded elsewhere (crash recovery, another replica). Each one
   * reuses its original ids, timestamp and actor, so the result is identical. Started by an
   * event listener, it is queued and returns undefined.
   * @param {Iterable<Operation>} ops
   * @param {{ history?: boolean }} [options] record replayed ops as undoable
   */
  replay(ops, options) {
    return this.#enter(() => this.#replay(ops, options))
  }

  /** @param {Iterable<Operation>} ops @param {{ history?: boolean }} [options] */
  #replay(ops, { history = false } = {}) {
    if (this.#group) fail('INVALID', 'Cannot replay inside a transaction')
    const applied = []
    for (const op of ops) {
      const entry = this.#require(op.command)
      // Operations from before command versions were recorded are version 1.
      const payload = this.#upgrade(
        entry,
        op.version ?? 1,
        toPlain(op.payload, `${op.command} payload`)
      )
      const { ctx, generated, queue, events } = this.#context({
        ids: op.ids,
        timestamp: op.timestamp,
        actorId: op.actorId,
      })
      try {
        this.#apply(entry, payload, ctx)
        if ((queue && queue.length) || generated.length !== (op.ids?.length ?? 0)) {
          fail(
            'CONFLICT',
            `Replay of operation ${op.id} (${op.command}) diverged: it allocated ${generated.length} id(s), the original allocated ${op.ids?.length ?? 0}`
          )
        }
      } catch (error) {
        ctx.tx.rollback()
        throw error
      }
      const done = this.#commit(ctx, generated, events, op.command, payload, entry, {
        opId: op.id,
        meta: op.meta,
        history: history && entry.undoable ? 'record' : 'none',
      })
      this.#publish(done.events)
      if (done.op) applied.push(done.op)
    }
    return applied
  }
}

/** @param {{ entities: {kind: string, id: string, value: any}[] }} payload @param {HandlerContext} ctx */
function restoreHandler(payload, ctx) {
  if (!Array.isArray(payload.entities)) fail('INVALID', 'model.restore needs an entities list')
  for (const { kind, id, value } of payload.entities) ctx.tx.restore(kind, id, value ?? null)
}

/**
 * @typedef {object} Operation
 * @property {string} id
 * @property {string} actorId
 * @property {string} timestamp ISO 8601
 * @property {string} command
 * @property {number} version   the version of the command the payload was written for
 * @property {any} payload
 * @property {{ type: 'model.restore', payload: { entities: {kind: string, id: string, value: any}[] } }} inverse
 * @property {number} baseRev   the model revision the command applied to
 * @property {number} modelRev  the model revision it made
 * @property {string[]} ids
 * @property {{ undoOf?: string, redoOf?: string }} [meta]
 *
 * @typedef {object} HandlerContext
 * @property {import('./store.js').Tx} tx
 * @property {() => string} newId
 * @property {(type: string, payload: any) => any} exec  run another command inside this one
 * @property {(event: string, data?: unknown) => void} emit  an event (a past-tense fact, plain
 *   data) for listeners, delivered after the commit and dropped if the command fails
 * @property {string} actorId
 * @property {string} timestamp
 * @property {import('./registry.js').Registry} [registry]
 *
 * @typedef {object} CommandMeta
 * @property {(payload: any, ctx: HandlerContext) => import('./result.js').Ok | import('./result.js').Err} [validate]
 *   checks the payload against the model before the handler runs; pure, and reads only
 * @property {number} [version]        the payload version (default 1); bump it when the payload
 *   shape changes
 * @property {Record<number, (payload: any) => any>} [upgrades]  for every earlier version n, a
 *   pure function turning a version-n payload into a version n+1 one
 * @property {boolean} [undoable]      recorded on the undo stack (default true)
 * @property {string} [description]
 * @property {string} [signature]
 * @property {boolean} [replace]       replace a command already registered under the type
 *
 * @typedef {object} HandlerEntry
 * @property {string} type
 * @property {(payload: any, ctx: HandlerContext) => any} handler
 * @property {CommandMeta['validate']} validate
 * @property {number} version
 * @property {Record<number, (payload: any) => any>} upgrades
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
 *
 * @typedef {[event: string, data: unknown]} Event
 */
