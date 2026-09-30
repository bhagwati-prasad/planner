# Pub/sub topic

A partitioned stream that every consumer group reads (Kafka, Kinesis, Pub/Sub, SNS).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

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

## State

| Field | Type | Holds |
| --- | --- | --- |
| `logs` | map | Each partition's retained messages and next offset |
| `offsets` | map | Each consumer group's partitions, positions and committed offsets |
| `published`, `bytes`, `buckets`, `dedup` | | Keyless messages so far, retained bytes, each partition's throughput allowance, and offsets by `dedupId` |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `publish` | the message body; `sizeBytes` from the message | `{ partition, offset }`, or with `duplicate: true` | `PARTITION_THROTTLED` |
| `subscribe` | `{ group }` | `{ group, partitions }` | |
| `poll` | `{ group, max }` | `[{ partition, offset, body }]` | `UNKNOWN_GROUP` |
| `commit` | `{ group }`, or `{ group, partition, offset }` | `{ ok: true }` | `UNKNOWN_GROUP`, `OFFSET_OUT_OF_RANGE` |

Private: `assignPartitions`, `compact`, `trimRetention`.

## Behaviour

- **Partitions.** A message goes to the partition its `orderingKey` field hashes to, or, with no key, to each partition in turn. Each partition takes at most `throughputPerPartition` MB per second, with at most a second's worth at once; over that, `publish` fails with `PARTITION_THROTTLED`.
- **Consumer groups.** The `consumerGroups` exist from the start, and `subscribe` adds others. A new group starts at the oldest retained messages. Each group is one consumer here, so it gets every partition. `poll` returns up to `max` messages after the group's position and moves it on. `commit` stores the group's positions, or one partition's offset. With `at-most-once` delivery `poll` commits as it goes, and with `exactly-once` a publish whose `dedupId` the topic has seen is dropped.
- **Retention.** On each publish, messages older than `retentionTime` go, then the oldest while the retained bytes exceed `retentionSize`. With `compaction`, a partition keeps only the latest message per key.
- **Metrics.** Each publish reports `1` for `publishRate`. After each publish and commit it reports `consumerLag.<group>` in messages and `consumerLagTime.<group>` in s (the age of the group's oldest uncommitted message) for every group, `partitionSkew` (how far the fullest partition is above the mean, as a fraction of it) and `retainedBytes` (across all `replicationFactor` replicas).
