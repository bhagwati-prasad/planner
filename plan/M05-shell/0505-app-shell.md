# 0505 App shell, layout and command palette

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0503](../M05-shell/0503-kit-controls.md), [0504](../M05-shell/0504-kit-containers.md) |

## Read first

- [Design system §4 Layout and app shell](../../docs/guidelines/design-system/04-layout-and-app-shell.md)
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Command palette
- [Design system §8 Interaction patterns](../../docs/guidelines/design-system/08-interaction-patterns.md): Saving and status

## Goal

Top bar, docked regions with resizing, density modes, responsive breakpoints, save status and the command palette.

## Tests to write first

Write these tests first, in `packages/ui/test/shell.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Panel sizes persist per project in sessionStorage
- [ ] Each ds §4 breakpoint produces its documented layout
- [ ] The command palette finds and runs actions, components and systems

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
