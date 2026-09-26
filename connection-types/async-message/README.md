# Async message

Fire-and-forget messages through a queue or topic.

Every connection also carries the base connection properties: mode (sync or async), network latency, bandwidth, packet loss, payload size, TLS overhead, timeout, and retries with backoff and jitter. Transmission delay is payload size divided by bandwidth.

Extends `base:connection`.

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `async` | Connection |  |
| `producerBatching` | integer (messages) | `1` | Messaging |  |
| `ackMode` | enum | `auto` | Messaging |  |
