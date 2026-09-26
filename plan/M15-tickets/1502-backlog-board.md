# 1502 Backlog and board

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M15 Tickets](../ROADMAP.md#m15-tickets) | R2 | todo | [1501](../M15-tickets/1501-ticket-model.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md): Views
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Ticket card

## Goal

The ranked backlog with inline edit and the kanban board with swimlanes by epic, system or assignee.

## Tests to write first

Write these tests first, in `packages/ui/test/board.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Drag-to-rank persists order
- [ ] Moving a card across columns changes its status through a command
- [ ] Swimlanes switch between epic, system and assignee

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
