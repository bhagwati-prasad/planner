# 1401 Doc templates

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M14 Doc types, ADRs and traceability](../ROADMAP.md#m14-doc-types-adrs-and-traceability) | R2 | todo | [1303](../M13-docs-engine/1303-live-bindings.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): Doc types

## Goal

Templates as plugins for every doc type in spec §15, including both design-guideline templates, with Strata's own guidelines as worked examples.

## Tests to write first

Write these tests first, in `packages/docs/test/templates.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each template renders on the recursive fixture with its live bindings filled in
- [ ] The component reference lists properties, state, methods and metrics for every component
- [ ] A project can override a built-in template

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
