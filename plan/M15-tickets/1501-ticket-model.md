# 1501 Ticket model

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M15 Tickets](../ROADMAP.md#m15-tickets) | R2 | todo | [1202](../M12-patterns-and-r1-release/1202-r1-exit.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md): Hierarchy and fields

## Goal

Epics, stories, sub-tasks, bugs and spikes with fields, per-system keys, links and dependencies.

## Tests to write first

Write these tests first, in `packages/plan/test/model.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Keys use the system prefix and stay unique when systems are renamed
- [ ] A dependency cycle between tickets is rejected
- [ ] Links to components, ADRs, requirements, tests and threads are validated

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
