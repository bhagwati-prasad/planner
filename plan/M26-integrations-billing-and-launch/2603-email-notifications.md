# 2603 Email notifications

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M26 Integrations, billing and launch](../ROADMAP.md#m26-integrations-billing-and-launch) | R5 | todo | [2301](../M23-collaborative-comments-and-review/2301-live-comments.md), [2401](../M24-multi-tenancy-and-identity/2401-tenancy.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): R5

## Goal

Email digests and notification emails with per-user preferences.

## Tests to write first

Write these tests first, in `packages/server/test/email.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Digests group notifications by project and respect each user's preferences
- [ ] Unsubscribe links work without signing in

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
