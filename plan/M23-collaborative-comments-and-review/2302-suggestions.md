# 2302 Suggestion comments

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M23 Collaborative comments and review](../ROADMAP.md#m23-collaborative-comments-and-review) | R4 | todo | [2301](../M23-collaborative-comments-and-review/2301-live-comments.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): R4 suggestions

## Goal

Comments that carry a model patch, previewed as a ghost overlay and applied as a normal command when accepted.

## Tests to write first

Write these tests first, in `packages/comments/test/suggestions.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A suggestion previews without changing the model
- [ ] Accepting applies it as one undoable command; rejecting closes it
- [ ] A suggestion whose target changed shows as outdated before it can be accepted

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
