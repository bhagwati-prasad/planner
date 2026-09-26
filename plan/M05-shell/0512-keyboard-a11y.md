# 0512 Keyboard map and accessibility pass

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0511](../M05-shell/0511-scrubber-runs.md), [0509](../M05-shell/0509-depth-navigation.md), [0508](../M05-shell/0508-inspector.md), [0507](../M05-shell/0507-library-panel.md) |

## Read first

- [Design system §9 Keyboard map](../../docs/guidelines/design-system/09-keyboard-map.md)
- [Design system §10 Accessibility](../../docs/guidelines/design-system/10-accessibility.md)

## Goal

Every shortcut in ds §9, the shortcut sheet, run announcements, and a whole-app accessibility pass.

## Tests to write first

Write these tests first, in `tests/e2e/keyboard.spec.js`, `tests/e2e/a11y.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every ds §9 shortcut performs its action and none fires while typing in a field
- [ ] A keyboard-only script draws a system, runs it, pauses, steps back and resumes
- [ ] axe reports no serious violations on any panel in any theme

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
