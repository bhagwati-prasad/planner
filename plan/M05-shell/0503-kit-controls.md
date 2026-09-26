# 0503 UI kit: controls

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0502](../M05-shell/0502-strata-element.md) |

## Read first

- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): General components, Unit input, Distribution input

## Goal

Button, icon button, input, unit input, distribution input, select and combobox, checkbox, switch, segmented control and slider.

## Tests to write first

Write these tests first, in `packages/ui/test/kit-controls.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each control matches its visual snapshots in light, dark and contrast themes
- [ ] Each control is fully keyboard-operable and passes axe with no serious violations
- [ ] Typing `2s` into a millisecond unit input stores 2,000

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
