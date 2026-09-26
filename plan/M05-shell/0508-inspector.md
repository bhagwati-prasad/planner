# 0508 Inspector: properties, state and methods

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0506](../M05-shell/0506-canvas-adapter.md) |

## Read first

- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Property grid, State editor, Method list

## Goal

Property grid with source markers, state editor and method list, including bindings for composites.

## Tests to write first

Write these tests first, in `packages/ui/test/inspector.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Overriding a property shows the accent dot, and resetting restores the default
- [ ] A rolled-up value is read-only with the sigma marker
- [ ] The state editor edits initial state in Design mode
- [ ] The method list shows bindings and marks unbound methods as "Unbound"

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
