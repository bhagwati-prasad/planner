# 1901 Named model snapshots

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M19 Versions, diff and what-if](../ROADMAP.md#m19-versions-diff-and-what-if) | R3 | todo | [1801](../M18-project-folder-and-merge/1801-folder-format.md) |

## Read first

- [Spec §3 Release roadmap](../../docs/spec/03-release-roadmap.md): R3
- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md)

## Goal

Create, list and restore named snapshots of the whole model.

## Tests to write first

Write these tests first, in `packages/core/test/snapshots.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Restoring a snapshot reproduces its state hash
- [ ] Restoring is one undoable command
- [ ] Snapshots are included in folder and `.strata` exports

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
