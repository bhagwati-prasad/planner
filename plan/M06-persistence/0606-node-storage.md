# 0606 Node filesystem adapter

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M06 Persistence](../ROADMAP.md#m06-persistence) | R0 | todo | [0604](../M06-persistence/0604-strata-file.md) |

## Read first

- [Engineering §17 Storage and persistence](../../docs/guidelines/engineering/17-storage-and-persistence.md)

## Goal

The Node adapter for the CLI, with atomic writes, passing the storage contract.

## Tests to write first

Write these tests first, in `packages/storage/test/node-fs.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The adapter passes the storage contract suite in Node
- [ ] A crash simulated between write and rename leaves the previous file intact

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
