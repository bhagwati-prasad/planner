# Starter library

The components and connection types Strata ships with (spec §8). They are ordinary plugins:
each folder has a `manifest.json`, an `icon.svg` and a README, and goes through the same packer,
validation and loading paths as any user component. None has behaviour code of its own yet; each
extends a built-in base type (`base:service`, `base:queue`, ...) whose behaviour the simulation
(R1) provides, configured by the properties listed in its README.

```sh
npm run serve                                   # the app, with these folders served and watched
npm run strata -- validate starter/components/cache
npm run strata -- pack --all starter/components # writes <folder>/<folder>.strata.js
```

Every component also has the common properties of `base:component` (technology, environment,
region, zone, instances, availability target, monthly cost, links) and the common metrics
(requests in and out, latency p50/p95/p99, error rate, utilisation, in-flight, dropped, health).
Every connection type has those of `base:connection` (mode, latency, bandwidth, packet loss,
payload size, TLS overhead, timeout, retries, backoff and jitter).

## Components

| Component | Id | Category | Extends |
| --- | --- | --- | --- |
| [API gateway](components/api-gateway/README.md) | `starter.api-gateway` | Edge | `base:proxy` |
| [Cache](components/cache/README.md) | `starter.cache` | Data | `base:cache` |
| [CDN](components/cdn/README.md) | `starter.cdn` | Edge | `base:proxy` |
| [Client (web / mobile)](components/client/README.md) | `starter.client` | Clients | `base:client` |
| [DNS](components/dns/README.md) | `starter.dns` | Edge | `base:proxy` |
| [External system (stub)](components/external-system/README.md) | `starter.external-system` | External | `base:external` |
| [Serverless function](components/function/README.md) | `starter.function` | Compute | `base:service` |
| [Auth / identity provider](components/identity-provider/README.md) | `starter.identity-provider` | Security | `base:service` |
| [Load balancer](components/load-balancer/README.md) | `starter.load-balancer` | Edge | `base:proxy` |
| [Message queue](components/message-queue/README.md) | `starter.message-queue` | Messaging | `base:queue` |
| [NoSQL / key-value DB](components/nosql-db/README.md) | `starter.nosql-db` | Data | `base:store` |
| [Object storage](components/object-storage/README.md) | `starter.object-storage` | Data | `base:store` |
| [Relational DB](components/relational-db/README.md) | `starter.relational-db` | Data | `base:store` |
| [Scheduler (cron)](components/scheduler/README.md) | `starter.scheduler` | Compute | `base:timer` |
| [Search index](components/search-index/README.md) | `starter.search-index` | Data | `base:store` |
| [Service](components/service/README.md) | `starter.service` | Compute | `base:service` |
| [Third-party API](components/third-party-api/README.md) | `starter.third-party-api` | External | `base:external` |
| [Pub/sub topic](components/topic/README.md) | `starter.topic` | Messaging | `base:topic` |
| [Worker pool](components/worker-pool/README.md) | `starter.worker-pool` | Compute | `base:service` |

## Connection types

Connection types are named in port `accepts` lists and on edges, so they use plain ids.

| Connection type | Id | Default mode |
| --- | --- | --- |
| [Async message](connection-types/async-message/README.md) | `async-message` | async |
| [DB protocol](connection-types/db-protocol/README.md) | `db-protocol` | sync |
| [File / batch](connection-types/file-batch/README.md) | `file-batch` | async |
| [gRPC](connection-types/grpc/README.md) | `grpc` | sync |
| [HTTP / REST](connection-types/http/README.md) | `http` | sync |
| [WebSocket](connection-types/websocket/README.md) | `websocket` | async |
