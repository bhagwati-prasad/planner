# 0414 Run lifecycle and controls

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0413](../M04-simulation-core/0413-snapshots-stepping.md) |

## Read first

- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md): Run states, Controls

## Goal

The run state machine and every control: play, pause, stop, restart, run to end, step into and out, speed, and following a request.

## Tests to write first

Write these tests first, in `packages/sim/test/controls.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Every transition in the spec §12 state diagram works, and every other one fails with `E_RUN_STATE`
- [x] Stop keeps partial results; restart reproduces the original run hash
- [x] Run to end stops at a breakpoint when one is hit
- [x] Changing speed never changes the run hash
- [x] Step into enters a private method call and an expanded composite; step out leaves them

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Where.** `createControl(input, options)` in strata-sim holds a run and its state machine. The worker drives it over the protocol, and the facade exposes it, in 0417. Strict to spec §12's diagram: a ready run only plays, and stepping, scrubbing and run to end need a paused run. Step while playing pauses after the step ("step finished").
- **Playing.** Each frame of the injected scheduler advances simulated time by the frame's length (16 ms) times the speed, so speed changes only pace. Infinity runs to the end in one frame. A run finishes when no event is left, or at `durationMs`, 60 s by default, since components with timers never run out of events. Load profiles (0802) will set the end.
- **Breakpoints.** 0414 needs only arrivals: `setBreakpoint({ node, method })` pauses before a message to a component, checked before each event (spec §13). The next move goes past the one it paused before. 0416 adds the other kinds.
- **Restart.** A fresh run from the same input and seed, with the requests injected before it started. `inject` is allowed only before the first play, so a restart reproduces the run hash. Run-only edits kept on restart come with 0415.
- **Frames.** Step into runs to the next span of the followed trace inside the frame that is a private call, or a call on a component deeper in the model (inside an expanded composite). Step out runs the frame's call to its end and moves to the nearest call above it. A private call starts and ends inside its caller's event, so stepping out of one only moves the frame.
- **Run.advance.** `run.advance({ until, before, untilUs, untilEvent })` stops after an event `until` holds for, or before one `before` holds for, and says why it stopped. The kernel can `peek` its next event.
