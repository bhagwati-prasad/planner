# 0504 UI kit: containers and feedback

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0502](../M05-shell/0502-strata-element.md) |

## Read first

- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): General components

## Goal

Tabs, tree, table, badge, chip, tag, tooltip, menu, popover, dialog, toast, empty state, skeleton, progress and avatar.

## Tests to write first

Write these tests first, in `packages/ui/test/kit-containers.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each component matches its visual snapshots in all three themes
- [ ] Dialogs trap focus and return it on close; menus and trees support arrow keys and type-ahead
- [ ] Tables virtualise above 200 rows

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
