# 0603 Multi-tab safety

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M06 Persistence](../ROADMAP.md#m06-persistence) | R0 | todo | [0601](../M06-persistence/0601-idb-adapter.md) |

## Read first

- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md): Durability
- [Engineering §17 Storage and persistence](../../docs/guidelines/engineering/17-storage-and-persistence.md)

## Goal

BroadcastChannel notifications, a Web Lock per project, a read-only second tab, and takeover.

## Tests to write first

Write these tests first, in `packages/storage/test/multitab.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A second tab on the same project opens read-only with a banner
- [ ] Taking over transfers the lock and makes the first tab read-only
- [ ] Changes in the writing tab appear in the read-only tab

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
