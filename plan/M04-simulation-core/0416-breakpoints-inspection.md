# 0416 Breakpoints and inspection

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0414](../M04-simulation-core/0414-run-controls.md) |

## Read first

- [Spec §13 Debugger](../../docs/spec/13-debugger.md)

## Goal

Breakpoints on public and private methods, arrivals, departures, edges, faults and named logs; hop, state, method-stack and effective-property inspection.

## Tests to write first

Write these tests first, in `packages/debug/test/*.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A breakpoint on a private method pauses before the method runs
- [ ] Hop inspection shows the diff between consecutive hops
- [ ] The method stack lists the active call chain for the followed request
- [ ] Effective properties report their source, including run-only changes

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
