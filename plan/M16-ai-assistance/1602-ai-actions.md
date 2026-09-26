# 1602 AI actions as suggestion diffs

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M16 AI assistance](../ROADMAP.md#m16-ai-assistance) | R2 | todo | [1601](../M16-ai-assistance/1601-ai-providers.md), [1404](../M14-doc-types-and-traceability/1404-conversions.md), [1504](../M15-tickets/1504-generation.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): AI assistance

## Goal

Draft a PRD from notes, an ADR from a thread, sections from the model, an architecture review against the rules, and proposed tickets, all delivered as diffs to accept or reject.

## Tests to write first

Write these tests first, in `packages/docs/test/ai-actions.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every action produces a diff and writes nothing until accepted
- [ ] Rejecting a diff leaves the model and docs unchanged
- [ ] Prompts include only the linked parts of the model, not the whole project

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
