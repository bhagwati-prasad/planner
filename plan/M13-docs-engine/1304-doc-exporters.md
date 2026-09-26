# 1304 Doc exporters and strata docs

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M13 Docs engine](../ROADMAP.md#m13-docs-engine) | R2 | todo | [1303](../M13-docs-engine/1303-live-bindings.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): Export and versioning
- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Node CLI

## Goal

Markdown, a static HTML site with SVG diagrams, PDF through a print stylesheet, and the `strata docs` command.

## Tests to write first

Write these tests first, in `packages/docs/test/export.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The HTML site works offline with no external references
- [ ] `strata docs --format md` writes one file per doc with relative links intact
- [ ] The print stylesheet paginates without cutting diagrams

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
