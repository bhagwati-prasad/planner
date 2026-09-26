# 0413 Snapshots, step units and time travel

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0404](../M04-simulation-core/0404-state-runtime.md) |

## Read first

- [Spec §12 Simulation controls and run lifecycle](../../docs/spec/12-simulation-controls-and-run-lifecycle.md): Step units, Scrubber and markers
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md): Snapshots, stepping and branches

## Goal

Snapshots every 10,000 events and at each pause; stepping forward and back by n in events, hops, followed hops, method calls or time; seek to any moment.

## Tests to write first

Write these tests first, in `packages/sim/test/stepping.test.js`, `tools/bench/stepping.bench.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Property: for every unit, stepping forward n then back n restores an identical state hash
- [ ] Seeking to a time gives the same state as running to it from zero
- [ ] Stepping back one hop in a 60 s run takes under 100 ms (benchmark)
- [ ] The snapshot memory cap thins old snapshots without making seeks inexact

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
