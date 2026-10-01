# Relational DB

A SQL database with connections, replicas and locks (PostgreSQL, MySQL, SQL Server).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8) and the `servers` field of its manifest (ADR 0020).

Extends `base:store`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `vcpu` | integer (vCPU) | `4` | Instance |  |
| `ram` | bytes | `16GB` | Instance |  |
| `maxConnections` | integer (connections) | `200` | Instance |  |
| `readLatency` | distribution (ms) | `{"kind":"lognormal","median":2,"p99":15}` | Performance |  |
| `writeLatency` | distribution (ms) | `{"kind":"lognormal","median":5,"p99":40}` | Performance |  |
| `iopsLimit` | integer (IOPS) | `3000` | Performance |  |
| `lockContention` | number (factor) | `0.05` | Performance | Share of writes that wait on a lock |
| `isolationLevel` | enum | `read-committed` | Performance |  |
| `readReplicas` | integer (replicas) | `0` | Replication |  |
| `replicationLag` | distribution (ms) | `{"kind":"lognormal","median":20,"p99":200}` | Replication |  |
| `failoverTime` | duration | `30s` | Replication |  |
| `storageUsed` | bytes | `50GB` | Storage |  |
| `storageCapacity` | bytes | `500GB` | Storage |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `readLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `readLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `readLatency.p99` until simulation measures it |
| `activeConnections` | connections | sum |  |
| `waitingConnections` | connections | sum |  |
| `readQps` | queries/s | sum |  |
| `writeQps` | queries/s | sum |  |
| `iopsUsed` | IOPS | sum |  |
| `storageUse` | % | max |  |
| `replicaLag` | ms | max |  |
| `deadlocks` | deadlocks | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `tables` | map | By table, by id: each committed row, when it was committed in ms, and its size in bytes |
| `replica` | map | By table, by id: the rows the read replicas have applied |
| `nextId` | map | By table: the last id it gave |
| `transactions` | map | By id: each open transaction, when it began, and its writes |
| `nextTx` | integer | The last transaction id it gave |
| `locks` | map | By `table:id`: the transaction holding the row |
| `waitsFor` | map | By transaction: the transaction whose lock it waits for |
| `replicatedUntil` | number | When the replicas apply the last write committed, in ms |
| `storage` | number | Bytes stored: `storageUsed` at the start, plus what inserts add |
| `ioWindow`, `ioUsed` | integer | The second IOPS are counted in, and the IOs used in it |
| `availableAt` | number | When a failover in progress ends, in ms |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `query` | `{ table, where?, limit?, tx?, primary? }` | the rows whose columns equal `where`'s | `NO_TRANSACTION`, `UNAVAILABLE` |
| `insert` | `{ table, row, tx? }` | `{ id }` | `DUPLICATE_KEY`, `STORAGE_FULL`, `DEADLOCK`, `SERIALIZATION_FAILURE`, `LOCK_TIMEOUT`, `NO_TRANSACTION`, `UNAVAILABLE` |
| `update` | `{ table, where, set, tx? }` | `{ updated }` | `DEADLOCK`, `SERIALIZATION_FAILURE`, `LOCK_TIMEOUT`, `NO_TRANSACTION`, `UNAVAILABLE` |
| `delete` | `{ table, where, tx? }` | `{ deleted }` | the same as `update` |
| `begin` | `{}` | `{ tx }` | `UNAVAILABLE` |
| `commit` | `{ tx }` | `{ committed }` | `NO_TRANSACTION`, `UNAVAILABLE` |
| `rollback` | `{ tx }` | `{ rolledBack }` | `NO_TRANSACTION`, `UNAVAILABLE` |

Private: `acquireConnection`, `lock`, `replicate`, `failover`.

## Behaviour

- **Tables.** Rows live in state by table and id. An insert takes the row's `id`, or the next number, and fails with `DUPLICATE_KEY` when that id exists. `where` matches rows whose columns equal its own. Queries take `readLatency`, and writes and commits `writeLatency`; each reports `1` for `readQps` or `writeQps`.
- **Connections.** `maxConnections` are the kernel's servers (ADR 0020): a call beyond them waits, and the run reports `activeConnections` and `waitingConnections`.
- **Transactions.** `begin` opens one. Writes that name it stay private to it, though queries that name it see them, until `commit` applies them or `rollback` discards them. A statement naming a transaction that is not open fails with `NO_TRANSACTION`.
- **Locks.**
  - A transaction's write locks its rows until it ends.
  - Another write to a locked row waits, looking again each millisecond, for at most 50 s (`LOCK_TIMEOUT`).
  - A wait that would close a cycle of transactions fails with `DEADLOCK`, rolls its transaction back and reports `deadlocks`.
  - At `repeatable-read` and `serializable`, a transaction's write to a row committed since it began fails with `SERIALIZATION_FAILURE`, and the transaction rolls back.
  - `lockContention` is the share of writes that also meet a lock held by work the model leaves out; each such write waits another `writeLatency`.
- **Read replicas.** With `readReplicas`, queries outside a transaction read the replicas unless they set `primary`. Each committed write reaches them after `replicationLag`, in commit order, and reports `replicaLag`.
- **IOPS.** Every query and write uses an IO and reports `iopsUsed`; those over `iopsLimit` in a second wait for the next.
- **Storage.** Storage starts at `storageUsed`. An insert adds the bytes of its message, and fails with `STORAGE_FULL` past `storageCapacity`. A delete frees them. Each insert reports `storageUse`, the share used.
- **Failover.** After a fault (spec §11 "Chaos"), the DB is unavailable for `failoverTime` (`UNAVAILABLE`), and its open transactions are lost.
- **Not modelled yet.** `vcpu` and `ram` do not change latency. Reads see the latest committed rows at every isolation level, with no snapshots. Replicas add no connections.
