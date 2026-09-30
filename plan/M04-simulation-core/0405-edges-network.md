# 0405 Edges, routing and the network model

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0403](../M04-simulation-core/0403-ctx-dispatch.md), [0308](../M03-component-model-and-plugins/0308-connection-types.md) |

## Read first

- [Spec §11 Simulation engine](../../docs/spec/11-simulation-engine.md): Routing and resources
- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md): Connection types

## Goal

Edge latency, transmission delay, loss, timeouts and retries with backoff and jitter; routing rules by method, path, header, weight and expression.

## Tests to write first

Write these tests first, in `packages/sim/test/network.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Transmission delay equals payload size divided by bandwidth
- [x] Weighted routing splits 10,000 seeded requests within tolerance
- [x] A timeout triggers retries with the configured backoff, and every attempt appears in the trace

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Decisions.** Routing by path and header needed a way for components to set them, so, as the human decided on 2026-09-30, `ctx.send` and `ctx.emit` take an optional fourth argument, `{ path, headers, sizeBytes }`, and every connection type has a `route` property (a list of rules, default `[]`) whose `when` rules use an in-house expression language ([ADR 0019](../../docs/adr/0019-messages-carry-protocol-details-and-edges-route-by-rules.md)). Spec §8, §9 and §11 say so.
- **Where it lives.** `packages/sim/src/run.js` crosses edges, times requests out and retries them; `src/route.js` reads rules and picks edges; `src/expr.js` compiles expressions. A run's edge is `{ id, from, to, method, props }` in place of 0403's fixed `latencyUs`, so the 0403 and 0404 tests' edge fixtures changed shape, with the same latencies.
- **Costs.** An edge property a run is not given costs nothing: no latency, no transmission delay, no loss, no timeout. The facade will pass each edge's values over its connection type's defaults when it builds runs (0417). Responses cross with the edge's `payloadSize`. TLS overhead is left for connection reuse, which nothing models yet.
- **Retries.** Only timeouts are retried, lost messages included; a callee's error response is not. The HTTP type's `idempotent` and `methodRules` are not read yet.
- **Trace.** Each attempt of a request is a `send` span, a child of the caller's span with `edge` and `attempt`. The callee's span stays a child of the caller's span, as 0403's test requires, rather than of the `send` span as OpenTelemetry would have it. Lost events leave no trace; loss counts come with the metrics pipeline (0804).
- **Rules are checked when a run starts.** Core accepts any list of strings for `route`, so a malformed rule shows first as `E_SIM_ROUTE_INVALID` from `createRun`. Checking rules when an edge is drawn would need the parser in core.
- **Beyond the listed tests.** Tests cover latency sampled from a distribution, jitter, packet loss, routing by method, path, header and expression, `E_SIM_NO_ROUTE` and `E_SIM_ROUTE_INVALID`, and the fields a method's `msg` has (`packages/sim/test/network.test.js`), and the expression language (`packages/sim/test/expr.test.js`). The connection-type test now requires `route` on every type.
