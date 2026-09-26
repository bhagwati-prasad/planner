# 0602 Write-ahead log and crash recovery

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M06 Persistence](../ROADMAP.md#m06-persistence) | R0 | todo | [0601](../M06-persistence/0601-idb-adapter.md) |

## Read first

- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md): Durability
- [Engineering §17 Storage and persistence](../../docs/guidelines/engineering/17-storage-and-persistence.md)

## Goal

The sessionStorage write-ahead log, flushing within 500 ms, replay on startup, and quota handling.

## Tests to write first

Write these tests first, in `packages/storage/test/wal.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Killing the tab before a flush and reopening it recovers every committed command
- [ ] Flushes complete within 500 ms of a command
- [ ] `QuotaExceededError` shows the blocking banner with an export action and drops nothing

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
