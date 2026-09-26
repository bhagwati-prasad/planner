# Pub/sub topic

A partitioned stream that every consumer group reads (Kafka, Kinesis, Pub/Sub, SNS).

Declarative: it has no behaviour code of its own; the base behaviour runs with these properties.

Extends `base:topic`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `partitions` | integer (partitions) | `6` | Capacity |  |
| `throughputPerPartition` | number (MB/s) | `10` | Capacity |  |
| `replicationFactor` | integer (replicas) | `3` | Durability |  |
| `retentionTime` | duration | `7d` | Durability |  |
| `retentionSize` | bytes | `100GB` | Durability |  |
| `compaction` | boolean | `false` | Durability | Keep only the latest message per key |
| `consumerGroups` | list | `[]` | Consumers |  |
| `orderingKey` | string | `` | Delivery | Message field that picks the partition |
| `deliverySemantics` | enum | `at-least-once` | Delivery |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `publishRate` | msg/s | sum |  |
| `consumerLag` | messages | sum | Per consumer group |
| `consumerLagTime` | s | max |  |
| `partitionSkew` | % | max |  |
| `retainedBytes` | bytes | sum |  |
