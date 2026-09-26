# 1301 Doc model and doc tree

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M13 Docs engine](../ROADMAP.md#m13-docs-engine) | R2 | todo | [1202](../M12-patterns-and-r1-release/1202-r1-exit.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md)

## Goal

Docs as entities attached to systems and components, stored as Markdown with front-matter, with a doc tree mirroring the system tree.

## Tests to write first

Write these tests first, in `packages/docs/test/model.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Creating a system creates its doc folder in the tree
- [ ] Docs round-trip through Markdown with front-matter unchanged
- [ ] Doc edits are undoable commands

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
