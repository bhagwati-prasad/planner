# 0601 IndexedDB storage adapter

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M06 Persistence](../ROADMAP.md#m06-persistence) | R0 | todo | [0106](../M01-core/0106-op-log.md) |

## Read first

- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md)
- [Engineering §17 Storage and persistence](../../docs/guidelines/engineering/17-storage-and-persistence.md)

## Goal

The IndexedDB adapter with its object stores and upgrade migrations, passing the storage contract suite.

## Tests to write first

Write these tests first, in `packages/storage/test/idb.spec.js`, `tools/contracts/storage.contract.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The adapter passes the storage contract suite in all three browsers
- [ ] Upgrading from database version N to N+1 runs its migration and keeps data
- [ ] Reloading the page restores the project exactly (state hash)

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
