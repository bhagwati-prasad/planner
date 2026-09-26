# 7. State, commands and events

State is immutable plain data. Commands are the only way to change it, and events report what changed.

## State

- Entities are plain objects in maps keyed by id. Updates use structural sharing through the in-house helpers `setIn`, `updateIn` and `removeIn`.
- Development builds deep-freeze state after each commit, so accidental mutation throws.
- Derived data (roll-ups, indexes, search) is never stored in state. It lives in memoised selectors keyed by `rev`.

## Defining a command

```js
// @ts-check
/** @type {import('../types.js').CommandDef<'node.rename', { nodeId: string, name: string }>} */
export const renameNode = {
  type: 'node.rename',
  version: 1,
  validate(state, { nodeId, name }) {
    if (!state.nodes[nodeId]) return err('E_NODE_NOT_FOUND', { nodeId })
    if (!name.trim()) return err('E_VALIDATION_EMPTY_NAME', { nodeId })
    return ok()
  },
  apply(state, { nodeId, name }, meta) {
    const before = state.nodes[nodeId].name
    return {
      state: setIn(state, ['nodes', nodeId, 'name'], name, meta),
      inverse: { type: 'node.rename', payload: { nodeId, name: before } },
      events: [{ type: 'node.renamed', nodeId, from: before, to: name }],
    }
  },
}
```

## Command rules

- `validate` and `apply` are pure and synchronous. They perform no I/O and read no globals.
- Payloads are JSON-safe: strings, numbers, booleans, `null`, arrays and plain objects. They never contain `undefined`, `Date`, `Map`, class instances or functions.
- `apply` returns an exact inverse. A property test checks that applying a command and then its inverse restores the original state, ignoring audit fields.
- The bus adds `meta` (`id`, `actorId`, `ts`, `baseRev`). Commands never create their own ids or timestamps.
- Compound operations such as `system.extract` use a pure planner that emits primitive commands. The bus applies them atomically as one batch, which is one undo step.
- When a payload shape changes, bump `version` and add an upgrader in `commands/upgrades/`, so old op logs and `.strata` files still replay.

## Event rules

- Events are facts in the past tense, emitted only after a successful commit.
- Event handlers never mutate state directly. A handler that needs to dispatch a command does so through the bus queue, never synchronously inside the handler.
- Event payloads are plain data, safe to post to a worker or a sync server.

## Checklist for a new command

- [ ] Name follows `<domain>.<verb>` and is registered in `core/src/commands/index.js`.
- [ ] Validation covers every failure with a documented error code.
- [ ] Inverse round-trip covered by the property test generator.
- [ ] Recursive fixture test if it touches systems, nodes, ports or edges (§9).
- [ ] Exposed on the facade with `help` metadata (§21).
- [ ] Comment anchoring works if it creates a new kind of entity.

---
Part of the [Strata Engineering Guidelines](README.md).
