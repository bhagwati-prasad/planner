# Search index

A full-text or vector search cluster (Elasticsearch, OpenSearch, Solr).

Behaviour in `index.js`, with self-tests in `tests/`. It uses only the behaviour API (spec §8).

Extends `base:store`, which provides the common properties (instances, availability target, monthly cost, technology, environment, region, zone, links) and metrics (requests, latency percentiles, error rate, utilisation, in-flight, dropped, health).

## Properties

| Property | Type | Default | Group | Notes |
| --- | --- | --- | --- | --- |
| `shards` | integer (shards) | `5` | Capacity |  |
| `replicas` | integer (replicas) | `1` | Capacity |  |
| `heap` | bytes | `8GB` | Capacity |  |
| `queryLatency` | distribution (ms) | `{"kind":"lognormal","median":15,"p99":120}` | Performance |  |
| `indexingThroughput` | rate | `2000/s` | Performance | Documents per second |
| `refreshInterval` | duration | `1s` | Performance |  |
| `indexSize` | bytes | `20GB` | Data |  |

## Metrics

| Metric | Unit | Roll-up | Notes |
| --- | --- | --- | --- |
| `latency.p50` |  |  | Estimated from `queryLatency.p50` until simulation measures it |
| `latency.p95` |  |  | Estimated from `queryLatency.p95` until simulation measures it |
| `latency.p99` |  |  | Estimated from `queryLatency.p99` until simulation measures it |
| `queries` | req/s | sum |  |
| `indexingLag` | s | max |  |
| `rejections` | req/s | sum |  |
| `indexSize` | bytes | sum |  |

## State

| Field | Type | Holds |
| --- | --- | --- |
| `docs` | map | By id: each searchable document and its size in bytes |
| `pending` | list | Index and delete operations in order, each with when it arrived and when it is indexed, in ms |
| `indexedUntil` | number | When the indexing pipeline is free, in ms |
| `buffered` | number | Bytes of documents not yet searchable |
| `size` | number | Bytes in the index, deleted documents included until a merge |
| `deleted` | number | Bytes of deleted documents a merge would reclaim |
| `refreshes` | integer | Refreshes so far |

## Methods

| Method | Input | Output | Errors |
| --- | --- | --- | --- |
| `index` | `{ id, doc }` | `{ id }` | `REJECTED` |
| `search` | `{ query }` | the documents with every term, best first, as `{ id, doc }` | |
| `delete` | `{ id }` | `null` | |

Private: `refresh`, `merge`.

## Behaviour

- **Indexing.** Documents are indexed one after another at `indexingThroughput`, and become searchable at the first refresh, every `refreshInterval`, after they are indexed. Each refresh that makes documents searchable reports `indexingLag`, in seconds, for the oldest of them.
- **Rejections.** Documents not yet searchable fill the indexing buffer, a tenth of `heap`, as in Elasticsearch. A document that would overflow it fails with `REJECTED` and reports `1` for `rejections`. A document takes the bytes of its message, or the length of its JSON.
- **Search.** A search matches the documents that contain every word of its query in their text, in any case, and ranks them by how often the words appear. It waits for the slowest of its `shards`, each taking `queryLatency`, and reports `1` for `queries`.
- **Deletes and merges.** A delete takes effect at a refresh, behind what is queued. Deleted and replaced documents keep their bytes in `indexSize` until a merge, every tenth refresh. The run starts from `indexSize` and reports it when it changes.
- **Not modelled yet.** `replicas` add neither search capacity nor index size.
