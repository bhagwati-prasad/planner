# 0419 Starter library: serverless function

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0409](../M04-simulation-core/0409-starter-compute.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The serverless function, complete per spec §9: memory, timeout, maximum and reserved concurrency (throttling on the servers of ADR 0020), cold starts with their probability and latency, keep-warm idle time, execution time and cost per GB-second and per invocation.

## Tests to write first

Write these tests first, in `components/function/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Cold starts follow the configured probability within tolerance over 10,000 seeded invocations

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0409 on 2026-09-30, as the human decided. The old task named the folder `components/serverless-function`, but the starter folder is `components/function`.
