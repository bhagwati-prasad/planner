# 0507 Library panel and project tree

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0506](../M05-shell/0506-canvas-adapter.md) |

## Read first

- [Design system §4 Layout and app shell](../../docs/guidelines/design-system/04-layout-and-app-shell.md)
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): General components

## Goal

The component library with search and drag-to-place, and the project tree of systems with stratum swatches.

## Tests to write first

Write these tests first, in `packages/ui/test/library.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Dragging from the library adds a component at the drop point
- [ ] Search filters by name, category and tag
- [ ] The project tree shows every level of the recursive fixture

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
