# 0104 Command bus

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0103](../M01-core/0103-adapters.md) |

## Read first

- [Engineering §7 State, commands and events](../../docs/guidelines/engineering/07-state-commands-and-events.md)

## Goal

Register command definitions; dispatch validates, applies, adds meta (id, actorId, ts, baseRev), records the inverse and emits events after commit.

## Tests to write first

Write these tests first, in `packages/core/test/command-bus.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A failing `validate` leaves state and `rev` unchanged and returns the error code
- [ ] A successful dispatch increments `rev` and emits events only after commit
- [ ] A handler that dispatches is queued, never re-entrant
- [ ] Payloads containing `undefined`, `Date`, `Map` or functions fail with `E_COMMAND_PAYLOAD`
- [ ] Property: apply then inverse restores state for every registered command, ignoring audit fields

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
