# 0415 Editing a paused run and branch runs

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0414](../M04-simulation-core/0414-run-controls.md) |

## Read first

- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md): Editing a paused run, Run tree
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Snapshots, stepping and branches

## Goal

The run-only override layer; resume with changes, replay from here and restart with changes; keep in model or discard; the run tree and run comparison.

## Tests to write first

Write these tests first, in `packages/sim/test/branches.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Resume with changes applies a capacity change from the current moment only
- [ ] Replay from here creates a branch sharing its parent's history, and its hash covers the parent hash, branch point and edits
- [ ] A code or structural edit disables resume and offers replay or restart
- [ ] Keep in model turns run-only edits into undoable commands; discard leaves the model untouched
- [ ] Comparing two runs returns metric and state differences at the same moment

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
