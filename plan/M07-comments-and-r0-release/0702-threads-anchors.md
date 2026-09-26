# 0702 Comment threads and anchors

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M07 Comments and R0 release](../ROADMAP.md#m07-comments-and-r0-release) | R0 | todo | [0115](../M01-core/0115-facade.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): What a comment can anchor to, Thread model, Behaviour

## Goal

The thread and comment model, every anchor type, outdated and orphan detection, re-anchoring, and the local identity profile.

## Tests to write first

Write these tests first, in `packages/comments/test/*.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A comment anchored to a property shows old and new values after that property changes
- [ ] Deleting a component moves its threads to the orphan tray with their snapshots
- [ ] A comment anchored to a run span stays valid after the model changes
- [ ] Thread fields merge last-writer-wins and comments merge as an add-wins set (property test)

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
