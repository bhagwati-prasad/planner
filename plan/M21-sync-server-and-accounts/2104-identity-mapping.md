# 2104 Local identities to accounts

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M21 Sync server and accounts](../ROADMAP.md#m21-sync-server-and-accounts) | R4 | todo | [2103](../M21-sync-server-and-accounts/2103-oplog-sync.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): Built for collaboration from R0

## Goal

On first import to a workspace, map local identities to accounts so authorship is preserved.

## Tests to write first

Write these tests first, in `packages/server/test/identity.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Comments and op-log entries keep their authors after mapping
- [ ] Unmapped identities stay as named guests

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
