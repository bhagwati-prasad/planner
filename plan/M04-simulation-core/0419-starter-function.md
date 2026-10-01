# 0419 Starter library: serverless function

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0409](../M04-simulation-core/0409-starter-compute.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The serverless function, complete per spec §9: memory, timeout, maximum and reserved concurrency (throttling in its own code; see Notes), cold starts with their probability and latency, keep-warm idle time, execution time and cost per GB-second and per invocation.

## Tests to write first

Write these tests first, in `components/function/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Cold starts follow the configured probability within tolerance over 10,000 seeded invocations

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0409 on 2026-09-30, as the human decided. The old task named the folder `components/serverless-function`, but the starter folder is `components/function`.
- **Done (2026-10-01).** The tests are in `components/function/tests/function.test.js`. Beyond the listed one, they cover the warm pool and keepWarmIdle, throttling at the maximum and reserved concurrency, the timeout, cost, downstream calls, and that every method, error and metric is exercised. Over 10,000 seeded invocations at 20 %, the cold-start rate is 19.5 %.
- **Decisions.** As the human decided on 2026-10-01:
  - The function throttles in its own code, with `THROTTLED`, rather than on ADR 0020's servers. With no backlog, the kernel would refuse before the behaviour runs, so `throttles` could not be counted. ADR 0020's implementation notes say so.
  - It gains a `calls` property for its downstream calls, like the service's endpoint calls, and spec §9's row lists them.
- **Model.**
  - An invocation with no idle warm instance always cold-starts, and a warm one cold-starts at `coldStartProbability`.
  - A timed-out instance is not kept warm.
  - Memory is billed in GB of 10⁹ bytes, as canonical units count them; Lambda's GB is 1,024 MB.
  - `reservedConcurrency` 0 means none reserved, not a function that always throttles.
