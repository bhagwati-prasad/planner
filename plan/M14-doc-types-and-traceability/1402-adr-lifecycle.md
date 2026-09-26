# 1402 ADR lifecycle

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M14 Doc types, ADRs and traceability](../ROADMAP.md#m14-doc-types-adrs-and-traceability) | R2 | todo | [1401](../M14-doc-types-and-traceability/1401-templates.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): ADR lifecycle

## Goal

MADR ADRs with statuses, supersedes links in both directions, and ADRs listed in the inspector's Links tab.

## Tests to write first

Write these tests first, in `packages/docs/test/adr.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Superseding an ADR updates both ADRs' statuses and links
- [ ] Selecting a component lists its ADRs
- [ ] Invalid transitions such as Deprecated to Proposed fail

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
