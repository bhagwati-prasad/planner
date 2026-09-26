# 0106 Operation log and command versions

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0105](../M01-core/0105-undo-batches.md) |

## Read first

- [Engineering §7 State, commands and events](../../docs/guidelines/engineering/07-state-commands-and-events.md)
- [Spec §5 Domain model](../../docs/spec/05-domain-model.md)

## Goal

Append every committed command to the op log; replaying it rebuilds identical state; upgraders migrate old command versions during replay.

## Tests to write first

Write these tests first, in `packages/core/test/oplog.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Replaying the op log from an empty project reproduces the same state hash
- [ ] A version-1 payload is upgraded to version 2 during replay
- [ ] Op log entries are JSON-safe and serialise with stable key order

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
