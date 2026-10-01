# 0413 Snapshots, step units and time travel

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0404](../M04-simulation-core/0404-state-runtime.md) |

## Read first

- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md): Step units, Scrubber and markers
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Snapshots, stepping and branches

## Goal

Snapshots every 10,000 events and at each pause; stepping forward and back by n in events, hops, followed hops, method calls or time; seek to any moment.

## Tests to write first

Write these tests first, in `packages/sim/test/stepping.test.js`, `tools/bench/stepping.bench.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Property: for every unit, stepping forward n then back n restores an identical state hash
- [x] Seeking to a time gives the same state as running to it from zero
- [x] Stepping back one hop in a 60 s run takes under 100 ms (benchmark)
- [x] The snapshot memory cap thins old snapshots without making seeks inexact

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **ADR 0023.** A method suspended at an `await` is a continuation no copy can capture. So snapshots are taken only at quiet event boundaries, where no method is suspended, and seeks replay forward from the latest one, as the human decided. Spec §13 and eng §13 say so. A run that never goes quiet seeks from time zero; task 0802 measures that under load.
- **What a snapshot holds.** Every component's state (copied through its views, since state may hold a view of another part of itself), servers and their waiting calls, the queue, random streams, trace and output counts, and running spans. Waiting calls are kept as their message and method, and rebuilt on restore. Promises whose calls have finished are restored without them, since settling them has no effect.
- **Positions.** `seek({ event })` reaches the end of an event; `seek({ timeUs })` reaches every event up to a time, then moves the clock there. Steps in hops, followed hops and calls end right after the event that makes them. A step back from elsewhere goes first to the last such event, so forward n then back n returns to where it started. Several calls starting or finishing in one event make one step.
- **Injections.** `run.inject` logs each request with how many events had run, and its trace id is drawn when it is scheduled, so a replay gives it the same moment and id. An injection behind the furthest point reached drops the later snapshots, step marks and injections.
- **Benchmark.** `tools/bench/stepping.bench.js` times the first step back one hop at the end of five fresh 60 s runs (about 43,000 events each). The slowest was 11.4 ms in Chromium.
- **Found on the way.** A behaviour that stores through the object `x ??= {}` returns, rather than a view, can put a view of other state inside state, which `structuredClone` refuses. The relational DB does so. Snapshots copy state through its views. A regression test covers it.
