# 0410 Starter library: relational DB

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0407](../M04-simulation-core/0407-base-behaviours.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md)
- [ADR 0020 Services queue on servers the kernel models](../../docs/adr/0020-services-queue-on-servers-the-kernel-models.md)

## Goal

The relational DB, complete per spec §9: tables in typed state that queries read and writes change, max connections on the kernel's servers (ADR 0020) with active and waiting connections, read and write latency, IOPS, transactions with their isolation level and lock contention, read replicas with their replication lag, failover and storage.

## Tests to write first

Write these tests first, in `components/relational-db/tests`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A row inserted by `insert` is returned by a later `query`
- [ ] Queries beyond max connections wait and appear as waiting connections

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Split** from 0410 (data stores) on 2026-10-01, as the human decided. It keeps 0410's first two tests.
- **Waiting connections.** As the human decided on 2026-10-01, a manifest's `servers` may name the kernel's gauges (ADR 0020's amendment), so the DB reports `activeConnections` and `waitingConnections`.
