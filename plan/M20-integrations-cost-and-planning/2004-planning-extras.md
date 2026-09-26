# 2004 Initiatives, custom fields, sprints and roadmap

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M20 Integrations, cost and planning](../ROADMAP.md#m20-integrations-cost-and-planning) | R3 | todo | [1503](../M15-tickets/1503-timeline.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md)

## Goal

Initiatives above epics, custom fields, sprint planning and a roadmap view.

## Tests to write first

Write these tests first, in `packages/plan/test/planning.test.js`, `packages/ui/test/planning.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Custom fields validate by type and export to Jira CSV
- [ ] Sprint capacity warns when overcommitted
- [ ] The roadmap groups initiatives by quarter

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
