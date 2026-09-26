# 14. Testing and architecture rules

Tests are first-class project artefacts with five types, authored either in a form-based UI or in code, and both produce the same JSON test spec. They run in the browser worker and, from R1, headlessly in Node for CI.

| Type | Example | Needs simulation |
| --- | --- | --- |
| Functional | `POST /orders` returns 201 and `body.status == "created"` | Yes, functional mode |
| Method | Call `placeOrder` on the Orders service alone, with its neighbours stubbed; expect 201 and one new row in `state.orders` | Yes, scoped to one component |
| Performance SLO | At 500 req/s with a 60 s ramp, gateway p95 < 200 ms and errors < 0.1% | Yes, load |
| Resilience | With `orders-db` primary down for 30 s, success ≥ 99% and recovery < 45 s | Yes, load + chaos |
| Architecture rule | No single point of failure on a critical path; services never share a database; public traffic only through the gateway; every queue has a DLQ; every node has an owner | No, static |

System contracts (§7) are checked automatically: a declared p99 that the derived value exceeds is a failing test. Every simulated test declares a scope (§11), so it can target one component, a selection, one system or the whole architecture.

## Authoring in code

```js
test('checkout holds p95 under load', async ({ sim, expect }) => {
  const run = await sim.load('checkout', { scope: { system: 'checkout' }, rate: 500, ramp: '60s', duration: '120s', seed: 7 })
  expect(run.node('api-gateway').latency.p95).toBeLessThan(200)
  expect(run.errorRate()).toBeLessThan(0.001)
})

rule('queues-have-dlq', (model, report) => {
  for (const q of model.nodes({ extends: 'base:queue' }))
    if (!q.port('dlq').connected) report.error(q, 'Queue has no dead-letter target')
})
```

## Running

- Suites, tags and multi-seed runs to flush out flaky results.
- Static rules re-run on every save; failures appear in Problems and as markers on the canvas.
- Results link back to the run, so any failing test opens directly in the debugger at the violating trace.
- `strata test <project> --tags slo --reporter junit` exits non-zero on failure for CI.
- Rules are plugins, so teams can publish their own architecture standards (R2).

---
Part of the [Strata Product and Technical Specification](README.md).
