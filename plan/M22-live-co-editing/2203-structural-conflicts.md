# 2203 Structural conflicts

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M22 Live co-editing](../ROADMAP.md#m22-live-co-editing) | R4 | todo | [2103](../M21-sync-server-and-accounts/2103-oplog-sync.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4

## Goal

Edits to entities another person deleted become orphans that can be restored or dropped.

## Tests to write first

Write these tests first, in `packages/core/test/structural-conflicts.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Editing a component deleted remotely produces an orphan item, not an error
- [ ] Restoring an orphan re-creates the component with the edit applied

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
