# 0408 Starter library: messaging and workers

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)

## Goal

Message queue, pub/sub topic and worker pool with every property, state field, method and metric from spec §9.

## Tests to write first

Write these tests first, in `components/message-queue/tests`, `components/topic/tests`, `components/worker-pool/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Each component's self-tests cover every public method and every declared error
- [x] The queue expires messages at the right simulated time and respects its overflow policy
- [x] The topic reports consumer lag per consumer group

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Shape.** Each of the three is an ordinary plugin: `index.js` holds its behaviour, using only `ctx` (spec §8), and `tests/` holds its self-tests. Their manifests now declare every state field, each public method's input, output and errors, and `entry`. The queue's `publish` takes `deliveryDelay`, as in spec §8's example. The versions stay 1.0.0, since the starter library has not been released. `strata validate` and `strata test-component` pass on all three.
- **Self-tests.** They import `createTestContext` from `strata/testing`, and `npm test` now registers the loader `strata test-component` uses, so they run with every other test (test in `tools/test/scaffold.test.js`). Each file ends with a test that its other tests called every public method, produced every declared error and reported every metric the manifest lists (a `.p50` or `.p99` metric is reported as samples of its base name).
- **Semantics chosen.**
  - Queue: capacity counts visible messages. `block-producer` holds a publish until a receive makes room. Retention keeps one timer, for the oldest message. The egress rate is a token bucket of one second. `per-key` ordering uses the body's `key`. `exactly-once` deduplicates by `dedupId`. Dead letters are published on `dlq` only when `dlqTarget` is set, since a behaviour cannot tell whether a port is connected. A `dropped` metric counts drop-oldest drops.
  - Topic: a consumer group is one consumer, so it gets every partition. Groups start at the oldest retained message. Partition throughput is a token bucket of one second. `retainedBytes` counts every replica.
  - Worker pool: it reads from a new `source` port and hands each message to its handler on `out` with no method (ADR 0019's amendment). A poison message goes back to the queue with `nack`, so the queue's `maxReceives` and dead-letter queue decide its fate.
- **Beyond the listed tests.**
  - The run gained spec §8's `init` hook, which the pool needs to start polling.
  - `runToEnd({ untilUs })` stops at a simulated time, since a pool polls for ever.
  - Timers get a copy of their data, as messages do, so none holds a live part of state.
  - Tests are in `packages/sim/test/dispatch.test.js`.
  - `packages/sim/test/starter.test.js` runs the real queue, pool and a handler over edges in the kernel.
  - `createTestContext` answers a send that names no method by its port, records send options, and copies arguments that hold parts of state, which it could not clone before (tests in `packages/plugins/test/behaviour.test.js`).
