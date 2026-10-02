# 0416 Breakpoints and inspection

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0414](../M04-simulation-core/0414-run-controls.md) |

## Read first

- [Spec §13 Debugger](../../docs/spec/13-debugger.md)

## Goal

Breakpoints on public and private methods, arrivals, departures, edges, faults and named logs; hop, state, method-stack and effective-property inspection.

## Tests to write first

Write these tests first, in `packages/debug/test/*.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A breakpoint on a private method pauses before the method runs
- [x] Hop inspection shows the diff between consecutive hops
- [x] The method stack lists the active call chain for the followed request
- [x] Effective properties report their source, including run-only changes

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- Breakpoints are in strata-debug (`packages/debug/src/debugger.js`), over a control from strata-sim: `{ on: 'call' | 'arrive' | 'depart' | 'edge' | 'log' }`. A run tells observers what happens inside each event (`run.observe`), and the control pauses before the event a breakpoint matched by seeking back one event, so a paused moment is always one a run from zero reaches (ADR 0023).
- Fault breakpoints (`{ on: 'fault' }`) fail with `INVALID` until chaos faults exist (R1).
- The hop log is opt-in: a run keeps every arriving message only with `inspect: true`, so runs without the debugger pay nothing for it. Seeks truncate it and forks copy it.
- Effective properties say `default`, `override` or `run-only`. Which ancestor's roll-up an override comes from is the model's to say (spec §6), which the facade adds in 0417.
- ADR 0024, the human's decision: strata-debug ships in the worker and counts with the worker bundle, not core, which stays at 252.8 KB. 0417 bundles it into the worker and adds the facade's side of the protocol.
