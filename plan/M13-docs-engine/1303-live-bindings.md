# 1303 Live bindings

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M13 Docs engine](../ROADMAP.md#m13-docs-engine) | R2 | todo | [1302](../M13-docs-engine/1302-block-editor.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): Editor and live bindings

## Goal

The `{{node:…}}`, `::diagram`, `::table`, `::metrics` and `::trace` directives, re-rendered on model change and frozen on export.

## Tests to write first

Write these tests first, in `packages/docs/test/bindings.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Renaming a component updates every doc that binds to it
- [ ] `::table` queries return rows matching the query
- [ ] Exports stamp "as of model revision N" and contain no live bindings

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
