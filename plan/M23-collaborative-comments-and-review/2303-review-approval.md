# 2303 Review and approval

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M23 Collaborative comments and review](../ROADMAP.md#m23-collaborative-comments-and-review) | R4 | todo | [2301](../M23-collaborative-comments-and-review/2301-live-comments.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): ADR lifecycle
- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): R4 review mode

## Goal

Request reviews on a system or doc at a snapshot, record approvals, and optionally require approvals to accept an ADR.

## Tests to write first

Write these tests first, in `packages/server/test/review.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] An ADR that requires two approvals can't be accepted with one
- [ ] Review comments anchor to the reviewed snapshot

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
