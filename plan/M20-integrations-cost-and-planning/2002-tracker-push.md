# 2002 Push to Jira, Linear and GitHub Issues

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M20 Integrations, cost and planning](../ROADMAP.md#m20-integrations-cost-and-planning) | R3 | todo | [1505](../M15-tickets/1505-jira-export.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md): Export and integration

## Goal

Push tickets through each tracker's API via the local server, recording remote ids for later updates.

## Tests to write first

Write these tests first, in `packages/plan/test/push.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Pushing against a recorded mock of each API creates issues with the mapped fields
- [ ] Pushing again updates instead of duplicating
- [ ] API tokens are stored like AI keys and never exported

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
