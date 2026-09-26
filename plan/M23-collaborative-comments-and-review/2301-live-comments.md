# 2301 Live comments and notifications

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M23 Collaborative comments and review](../ROADMAP.md#m23-collaborative-comments-and-review) | R4 | todo | [2104](../M21-sync-server-and-accounts/2104-identity-mapping.md), [0703](../M07-comments-and-r0-release/0703-comments-ui.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): Built for collaboration from R0

## Goal

Live thread updates, presence in threads, @mentions, watching elements and systems, and an in-app inbox.

## Tests to write first

Write these tests first, in `packages/comments/test/live.test.js`, `packages/ui/test/inbox.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A mention creates an inbox item for the mentioned person only
- [ ] Watching a system notifies about threads anywhere inside it
- [ ] Thread updates appear live in other sessions

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
