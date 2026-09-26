# 1302 Block editor

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M13 Docs engine](../ROADMAP.md#m13-docs-engine) | R2 | todo | [1301](../M13-docs-engine/1301-doc-model.md) |

## Read first

- [Spec §15 Documentation system](../../docs/spec/15-documentation-system.md): Editor and live bindings
- [Design system §3 Design tokens](../../docs/guidelines/design-system/03-design-tokens.md): Typography tokens
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

A block editor Web Component (headings, text, lists, tables, callouts, embeds) over Markdown, with the sanitiser.

## Tests to write first

Write these tests first, in `packages/ui/test/editor.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each block type round-trips to Markdown
- [ ] Pasted HTML with scripts or event handlers is sanitised
- [ ] The editor is keyboard-accessible and passes axe

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
