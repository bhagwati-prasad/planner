# 2601 Two-way Jira sync

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M26 Integrations, billing and launch](../ROADMAP.md#m26-integrations-billing-and-launch) | R5 | todo | [2002](../M20-integrations-cost-and-planning/2002-tracker-push.md), [2401](../M24-multi-tenancy-and-identity/2401-tenancy.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md): Export and integration

## Goal

Keep tickets and Jira issues in sync in both directions, with conflicts surfaced for review.

## Tests to write first

Write these tests first, in `packages/server/test/jira-sync.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A change on either side appears on the other against recorded API fixtures
- [ ] A simultaneous change on both sides becomes a conflict item

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
