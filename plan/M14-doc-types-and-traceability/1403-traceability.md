# 1403 Traceability matrix and impact analysis

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M14 Doc types, ADRs and traceability](../ROADMAP.md#m14-doc-types-adrs-and-traceability) | R2 | todo | [1402](../M14-doc-types-and-traceability/1402-adr-lifecycle.md), [1502](../M15-tickets/1502-backlog-board.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md)
- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md)

## Goal

Requirement ids in the PRD linked through ADRs, components, tickets and tests, with a matrix view and impact analysis.

## Tests to write first

Write these tests first, in `packages/docs/test/trace.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The matrix shows every requirement with its linked ADRs, components, tickets and tests
- [ ] Changing a component lists the affected requirements, ADRs, tickets and tests
- [ ] A requirement with no linked test is flagged

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
