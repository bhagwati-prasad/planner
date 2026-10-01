# 0022 Components see, and may choose, the edges leaving a port

Status: Accepted
Date: 2026-10-01

## Context and problem

Task 0421's load balancer spreads requests over its targets by round-robin, least connections, weight, IP hash or consistent hash, and health-checks each target (spec §9). Its targets are the components at the ends of the edges leaving its `out` port. Behaviour code cannot see those edges, or send over a chosen one. `ctx.send(port, …)` leaves the choice to the edges' route rules: the rules that hold, then a weighted draw (ADR 0019). A weighted draw is not round-robin, and nothing lets a component health-check one target. Changing the behaviour API needs the human's decision (CLAUDE.md, "Ask the human first").

## Decision drivers

- Follow spec §9: every algorithm, and health checks with thresholds.
- Built-in components use only the public plugin API (eng §10), so a user's own balancer, sharded client or replica picker can do the same.
- Stay deterministic: the order of targets must not depend on anything but the model.
- Keep route rules as they are for every component that does not choose.

## Considered options

1. **`ctx.targets(port)` and an `edge` send option.** `ctx.targets(port)` lists the edges leaving a port, in the order the run was given them, as `{ edge, node, weight }`: the edge's id, the component at its end, and its route `weight` (1 by default). `ctx.send(port, method, args, { edge })`, and `ctx.emit` likewise, sends over that edge and skips the route rules. An edge that does not leave the port fails with `E_SIM_EDGE_NOT_FOUND`. `createTestContext` answers `targets` from a `targets` option, and `runComponent` can put several stubs behind one port.
2. **A header convention.** The balancer sets a header such as `x-target: 2`, and each edge carries a rule `header x-target = 2`. No API change, but people must write a rule on every edge, and health checks need the same.
3. **Weighted only.** Route weights already give a weighted draw, and the other algorithms and health checks wait.

## Decision outcome

Chosen option: 1, decided by the human on 2026-10-01, together with splitting 0420 into the API gateway (0420) and the load balancer (0421). Components that choose their own targets do so through the public API, and those that do not keep route rules.

## Consequences

- Good: every algorithm of spec §9, and health checks of each target, in behaviour code.
- Good: any component can address its targets, such as a client that shards by key.
- Bad: the behaviour API grows by one member and one send option, which spec §8 lists.
- Bad: a component that names an edge bypasses that edge's route rules, so its author owns the choice.
- Follow-up tasks: 0421 uses it for the load balancer.
