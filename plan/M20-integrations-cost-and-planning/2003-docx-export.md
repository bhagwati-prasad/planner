# 2003 DOCX export

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M20 Integrations, cost and planning](../ROADMAP.md#m20-integrations-cost-and-planning) | R3 | todo | [1304](../M13-docs-engine/1304-doc-exporters.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): Export and versioning

## Goal

An in-house DOCX writer for docs, including headings, lists, tables and diagrams as images.

## Tests to write first

Write these tests first, in `packages/docs/test/docx.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The produced file opens in Word and LibreOffice (validated against the OOXML schema)
- [ ] Headings map to Word heading styles

## Notes

- The zip container needs a DEFLATE writer; `CompressionStream('deflate-raw')` or Node `zlib` covers it without dependencies.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
