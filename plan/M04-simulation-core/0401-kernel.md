# 0401 Kernel: event queue, integer time and PRNG streams

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0009](../M00-foundation-and-walking-skeleton/0009-skeleton-sim.md), [0103](../M01-core/0103-adapters.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Kernel
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md)

## Goal

A binary-heap queue ordered by (timeUs, priority, seq), xoshiro128** streams per component seeded through splitmix32, deterministic `log` and `exp`, and pooled events.

## Tests to write first

Write these tests first, in `packages/sim/test/kernel.test.js`, `tools/bench/kernel.bench.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Simultaneous events dispatch in insertion order
- [ ] Property: random schedules always dispatch in non-decreasing time order
- [ ] Adding a component does not change another component's random sequence
- [ ] Deterministic `log` and `exp` match reference vectors bit for bit
- [ ] Benchmark: at least 200,000 simple events per second

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
