# Relational DB

A SQL database with connections, replicas and locks (PostgreSQL, MySQL, SQL Server).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

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
