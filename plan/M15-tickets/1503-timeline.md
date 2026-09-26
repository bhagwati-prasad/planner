# 1503 Timeline view

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M15 Tickets](../ROADMAP.md#m15-tickets) | R2 | todo | [1501](../M15-tickets/1501-ticket-model.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md): Views

## Goal

A Gantt view with dependencies and the critical path.

## Tests to write first

Write these tests first, in `packages/plan/test/timeline.test.js`, `packages/ui/test/timeline.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The critical path is computed correctly on a fixture
- [ ] Dragging a bar that would break a dependency is refused with a reason

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
