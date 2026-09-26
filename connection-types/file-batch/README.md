# File / batch

Scheduled transfers of files or batches.

Every connection also carries the base connection properties: mode (sync or async), network latency, bandwidth, packet loss, payload size, TLS overhead, timeout, and retries with backoff and jitter. Transmission delay is payload size divided by bandwidth.

Extends `base:connection`.

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `async` | Connection |  |
| `transferSize` | bytes | `100MB` | Batch |  |
| `schedule` | string | `0 * * * *` | Batch | Cron expression |
| `compressionRatio` | number (ratio) | `3` | Batch |  |
