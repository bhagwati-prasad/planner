# 1803 Cross-project system references

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M18 Project folder and merge](../ROADMAP.md#m18-project-folder-and-merge) | R3 | todo | [1801](../M18-project-folder-and-merge/1801-folder-format.md) |

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Placement modes

## Goal

Place a system from another project folder by reference, pinned to a version.

## Tests to write first

Write these tests first, in `packages/core/test/cross-project.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A referenced system is read-only and shows its source project and version
- [ ] Bumping the version shows a diff before applying
- [ ] A missing source project shows a placeholder and loses nothing

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
