# 0414 Run lifecycle and controls

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0413](../M04-simulation-core/0413-snapshots-stepping.md) |

## Read first

- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md): Run states, Controls

## Goal

The run state machine and every control: play, pause, stop, restart, run to end, step into and out, speed, and following a request.

## Tests to write first

Write these tests first, in `packages/sim/test/controls.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every transition in the spec §12 state diagram works, and every other one fails with `E_RUN_STATE`
- [ ] Stop keeps partial results; restart reproduces the original run hash
- [ ] Run to end stops at a breakpoint when one is hit
- [ ] Changing speed never changes the run hash
- [ ] Step into enters a private method call and an expanded composite; step out leaves them

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
