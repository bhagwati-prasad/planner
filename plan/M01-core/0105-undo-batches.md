# 0105 Undo, redo and atomic batches

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0104](../M01-core/0104-command-bus.md) |

## Read first

- [Engineering §7 State, commands and events](../../docs/guidelines/engineering/07-state-commands-and-events.md)

## Goal

Undo and redo stacks; batches applied atomically as one undo step and rolled back entirely when any command fails.

## Tests to write first

Write these tests first, in `packages/core/test/undo.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A batch of five commands undoes in one step
- [ ] A batch whose third command fails leaves state unchanged
- [ ] Redo reapplies identically; a new command clears the redo stack

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
