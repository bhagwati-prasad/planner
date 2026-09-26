# 0510 Run control bar and scope picker

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0506](../M05-shell/0506-canvas-adapter.md), [0417](../M04-simulation-core/0417-facade-sim.md) |

## Read first

- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Run control bar
- [Design system §8 Interaction patterns](../../docs/guidelines/design-system/08-interaction-patterns.md): Choosing a scope, Editing a paused run
- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md)

## Goal

Every control, the step unit and count, speed, the scope chip with its stub preview, the run-only change chip, and the continuation split button.

## Tests to write first

Write these tests first, in `packages/ui/test/run-bar.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every button calls the facade, and enabled states match the run state machine
- [ ] Editing a capacity while paused shows the change chip and turns Play into "Resume with changes"
- [ ] The scope preview lists every stubbed edge with an editable stub mode

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
