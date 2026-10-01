# 0410 Starter library: relational DB

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The relational DB, complete per spec §9: tables in typed state that queries read and writes change, max connections on the kernel's servers (ADR 0020) with active and waiting connections, read and write latency, IOPS, transactions with their isolation level and lock contention, read replicas with their replication lag, failover and storage.

## Tests to write first

Write these tests first, in `components/relational-db/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A row inserted by `insert` is returned by a later `query`
- [x] Queries beyond max connections wait and appear as waiting connections

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided. It keeps 0410's first two tests.
- **Waiting connections.** As the human decided on 2026-10-01, a manifest's `servers` may name the kernel's gauges (ADR 0020's amendment), so the DB reports `activeConnections` and `waitingConnections`.
- **Done (2026-10-01).** The tests are in `components/relational-db/tests/relational-db.test.js`. Beyond the two listed, they cover updates and deletes, transactions, lock waits, deadlocks and the lock timeout, serialization failures, read replicas, IOPS, storage, lock contention, failover, and that every method, error and metric is exercised. The kernel's test for named gauges is in `packages/sim/test/servers.test.js`.
- **Model.**
  - Locks are real row locks. A waiting write polls each millisecond for at most 50 s, and deadlocks are found as cycles of waiting transactions.
  - `lockContention` adds waits for work outside the model.
  - Repeatable read and serializable fail a write to a row committed since the transaction began.
  - Reads take no snapshots, read uncommitted behaves as read committed, as in PostgreSQL, and replicas add no connections.
  - `vcpu` and `ram` change nothing yet.
  - Failover runs from `onFault`, which the run calls from M09 on; its test calls the hook directly.
