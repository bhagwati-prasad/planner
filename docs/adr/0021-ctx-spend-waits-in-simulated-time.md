# 0021 ctx.spend waits in simulated time

Status: Accepted
Date: 2026-09-30

## Context and problem

The starter service's `endpoints` property gives each endpoint its own `serviceTime` (spec §9, task 0409). A method's latency is the one distribution or property its manifest declares, and a private call's latency is fixed the same way (spec §8). So behaviour code cannot spend a time it chooses while it runs: `ctx` offers no delay, and awaiting anything but a ctx promise is refused (`E_BEHAVIOUR_AWAIT`). Adding a delay changes the plugin API (CLAUDE.md, "Ask the human first").

## Decision drivers

- Let a component model work whose duration depends on the request, such as an endpoint's service time or a batch's size, without a private method per duration.
- Stay deterministic: the wait is a kernel event, and its duration comes from the node's own random stream.
- Keep the call's server (ADR 0020) while it works, so queueing reflects the time spent.

## Considered options

1. **`await ctx.spend(dist)`:** a ctx promise that resolves once `dist`, a number of ms or a distribution, has passed in simulated time. The call keeps its server meanwhile, and the time counts toward its span. `createTestContext` records each spend and moves its clock on.
2. **A latency in the return value,** such as `return { latency, body }`. It avoids a new member, but it overloads responses and cannot express work between downstream calls.
3. **One private method per duration.** It needs no API change, but an endpoint list the user edits cannot declare methods.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-30. It is the smallest addition that lets a method's own logic decide how long it works, and it composes with `ctx.send`.

## Consequences

- Good: the service's endpoints each take their own service time, and any component can model variable work.
- Bad: the behaviour API grows by one member, which spec §8's table lists.
- Follow-up tasks: 0409 (the service's endpoints), and `strata validate` accepts `await ctx.spend(…)` like `await ctx.send(…)`.

## Amendment, 2026-10-01

Task 0420's gateway must answer at its request timeout while its upstream still works, and task 0421's load balancer needs a timeout for its health checks. A method cannot do that by awaiting one promise at a time. The human decided that behaviour code may also await `Promise.race` of ctx promises, as it already may await `Promise.all` and `Promise.allSettled` of them. `await Promise.race([ctx.send(…), ctx.spend(timeout)])` resolves when the first of them settles. Both are settled by kernel events, so the race stays deterministic. The loser settles later, unobserved. `strata validate` accepts it, and spec §8 and eng §10 say so.

