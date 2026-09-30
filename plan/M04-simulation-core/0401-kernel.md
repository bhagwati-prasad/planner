# 0401 Kernel: event queue, integer time and PRNG streams

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0009](../M00-foundation-and-walking-skeleton/0009-skeleton-sim.md), [0103](../M01-core/0103-adapters.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Kernel
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md)

## Goal

A binary-heap queue ordered by (timeUs, priority, seq), xoshiro128** streams per component seeded through splitmix32, deterministic `log` and `exp`, and pooled events.

## Tests to write first

Write these tests first, in `packages/sim/test/kernel.test.js`, `tools/bench/kernel.bench.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Simultaneous events dispatch in insertion order
- [x] Property: random schedules always dispatch in non-decreasing time order
- [x] Adding a component does not change another component's random sequence
- [x] Deterministic `log` and `exp` match reference vectors bit for bit
- [x] Benchmark: at least 200,000 simple events per second

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- The queue, its ordering and the per-component streams existed from the walking skeleton (0009), so the first three tests passed on their first run. The property test's first draft also asked that simultaneous events come out by priority when a handler had just scheduled one of them; such an event cannot run before the handler that scheduled it, so the test compares only events that were both waiting.
- Pooled events have their own test in `packages/sim/test/kernel.test.js`: the queue reuses the entry it last returned once the next event is popped.
- The reference vectors in `packages/sim/test/fixtures/log-exp-vectors.json` come from Node's `Math.log` and `Math.exp`, which are V8's port of fdlibm. The port also matched them on 9 million random inputs. Plain fdlibm gives `exp(1)` one ulp above `Math.E`; V8 and this port return `Math.E`.
- The benchmark runner knew only budgets that are ceilings. A measure now says `better: 'higher'` when its budget is a floor.
- The new module made the facade bundle's renaming test fail on its 15% margin. The renamer gave one-letter bindings two-letter names in large bundles, where every one-letter name is taken; it now keeps a binding's name rather than lengthen it (a test in `packages/plugins/test/minify.test.js`).
- Core, facade and the non-UI packages reached 257.5 KB of their 255 KB. As the human decided on 2026-09-29, their exception is recorded and owned by the new task 0418, which keeps strata-sim to the worker bundle and restores the size test's earlier form.

