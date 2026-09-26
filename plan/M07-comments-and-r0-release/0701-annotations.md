# 0701 Annotations

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M07 Comments and R0 release](../ROADMAP.md#m07-comments-and-r0-release) | R0 | todo | [0206](../M02-strata-graph/0206-frames-annotations.md), [0506](../M05-shell/0506-canvas-adapter.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md)
- [Design system §6 Canvas visual language](../../docs/guidelines/design-system/06-canvas-visual-language.md): Annotations

## Goal

Notes, callouts, text and highlight regions as view entities, created and edited through commands and included in exports.

## Tests to write first

Write these tests first, in `packages/core/test/annotations.test.js`, `packages/ui/test/annotations.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Creating, editing and deleting annotations are undoable commands
- [ ] Annotations appear in SVG and PNG exports
- [ ] Deleting a view deletes its annotations

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
