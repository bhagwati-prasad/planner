# 2202 Text CRDT for docs

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M22 Live co-editing](../ROADMAP.md#m22-live-co-editing) | R4 | todo | [2103](../M21-sync-server-and-accounts/2103-oplog-sync.md), [1302](../M13-docs-engine/1302-block-editor.md) |

## Read first

- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R4
- [Spec §21 Security, non-functional requirements and resolved questions](../../docs/spec/21-security-non-functional-requirements-and-resolved-questions.md): Resolved questions: in-house sync

## Goal

An in-house sequence CRDT for doc bodies, integrated with the block editor.

## Tests to write first

Write these tests first, in `packages/docs/test/crdt.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Property: concurrent inserts and deletes from three replicas converge in any delivery order
- [ ] Formatting survives concurrent edits
- [ ] Document size stays bounded through garbage collection of tombstones

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
