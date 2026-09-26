# DB protocol

A database wire protocol through a connection pool.

Every connection also carries the base connection properties: mode (sync or async), network latency, bandwidth, packet loss, payload size, TLS overhead, timeout, and retries with backoff and jitter. Transmission delay is payload size divided by bandwidth.

Extends `base:connection`.

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `poolSize` | integer (connections) | `10` | Pool |  |
| `acquireTimeout` | duration | `1s` | Pool |  |
| `preparedStatements` | boolean | `true` | Pool |  |
