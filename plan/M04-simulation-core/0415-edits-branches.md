# 0415 Editing a paused run and branch runs

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0414](../M04-simulation-core/0414-run-controls.md) |

## Read first

- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md): Editing a paused run, Run tree
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Snapshots, stepping and branches

## Goal

The run-only override layer; resume with changes, replay from here and restart with changes; keep in model or discard; the run tree and run comparison.

## Tests to write first

Write these tests first, in `packages/sim/test/branches.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Resume with changes applies a capacity change from the current moment only
- [x] Replay from here creates a branch sharing its parent's history, and its hash covers the parent hash, branch point and edits
- [x] A code or structural edit disables resume and offers replay or restart
- [x] Keep in model turns run-only edits into undoable commands; discard leaves the model untouched
- [x] Comparing two runs returns metric and state differences at the same moment

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **The override layer.** A control holds run-only edits while paused, and a run logs the ones it takes with their moment, as it does injected requests. Seeks and replays make them again then. Snapshots now hold each component's property values, and a restore after a code or structure edit rebuilds the run's shape as it was. An edit behind the furthest point reached starts a new future.
- **Continuing.** Resume takes property and state edits only. Replay from here forks the run at the moment: the branch shares its parent's snapshots (the same objects) and a copy of its trace, replays from the latest snapshot to the moment, and makes the edits. Removing a component with calls or messages on their way leaves only restart. Restart with changes stops a paused run, then restarts, so it stays within spec §12's diagram, and makes every edit of the run's lineage from time zero.
- **Run tree and hashes.** Each run records its parent, branch point, edits, seed and hash. A root's hash covers the engine, seed and model, with behaviour code as its source text. A branch's covers its parent's hash, branch point and edits.
- **Keep in model.** Only property values have a model command today (`node.setProps`), by the component's node id, the last part of its run path; the model keeps distributions in canonical form. State, code and structure edits come back as `notKept`. The facade (0417) dispatches the commands in one transaction, so one undo reverts them. Kept or discarded edits are no longer run-only, but edits waiting still apply when the run continues.
- **Comparison.** `compareRuns` moves both runs to the moment, then compares metric summaries by component and name, and state down to the differing values.
