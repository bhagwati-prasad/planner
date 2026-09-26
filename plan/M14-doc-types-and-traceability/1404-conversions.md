# 1404 Converting comments

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M14 Doc types, ADRs and traceability](../ROADMAP.md#m14-doc-types-adrs-and-traceability) | R2 | todo | [1402](../M14-doc-types-and-traceability/1402-adr-lifecycle.md), [1502](../M15-tickets/1502-backlog-board.md) |

## Read first

- [Spec §17 Annotations and comments](../../docs/spec/17-annotations-and-comments.md): Behaviour

## Goal

Convert a thread into an ADR draft, a ticket, a risk register entry or a resilience test stub, linked both ways.

## Tests to write first

Write these tests first, in `packages/comments/test/convert.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A decision-needed thread becomes an ADR draft that quotes the thread
- [ ] A "what if the DB fails?" thread becomes a resilience test stub scoped to that component
- [ ] The converted thread links to its result and the result links back

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
