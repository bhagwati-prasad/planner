# 1801 Git-friendly project folder

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M18 Project folder and merge](../ROADMAP.md#m18-project-folder-and-merge) | R3 | todo | [1706](../M17-visual-extras-and-r2-release/1706-r2-exit.md) |

## Read first

- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md): Later formats
- [Spec §20 Collaboration and SaaS architecture](../../docs/spec/20-collaboration-and-saas-architecture.md): R3

## Goal

One file per system, view, doc and ticket, with stable key order and positions kept in view files, converting both ways with `.strata`.

## Tests to write first

Write these tests first, in `packages/storage/test/folder.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] `.strata` → folder → `.strata` round-trips with the same state hash
- [ ] Moving one component changes exactly one view file
- [ ] Renaming a component changes only the files that mention it

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
