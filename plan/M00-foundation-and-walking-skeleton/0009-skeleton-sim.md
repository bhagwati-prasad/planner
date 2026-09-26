# 0009 Walking skeleton: one request through two components

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | todo | [0005](../M00-foundation-and-walking-skeleton/0005-bundler.md), [0007](../M00-foundation-and-walking-skeleton/0007-ci-and-browser-tests.md), [0008](../M00-foundation-and-walking-skeleton/0008-skeleton-core.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md)
- [Engineering §13 Simulation engine](../../docs/guidelines/engineering/13-simulation-engine.md)

## Goal

A minimal kernel that runs in a Blob-URL Web Worker and in `worker_threads`, sends one request from a client component to a service over the edge, and returns the response after a fixed simulated latency.

## Tests to write first

Write these tests first, in `packages/sim/test/skeleton.test.js`, `tests/e2e/skeleton-sim.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] In Node the response arrives at the expected simulated time
- [ ] Two runs with the same seed produce the same run hash
- [ ] From `file://` in all three browsers, the worker starts from a Blob URL and produces the same hash as Node

## Notes

- This code grows into M04; keep it clean rather than throwaway.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
