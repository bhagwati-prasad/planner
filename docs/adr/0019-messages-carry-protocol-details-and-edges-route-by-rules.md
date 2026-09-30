# 0019 Messages carry protocol details, and edges route by rules

Status: Accepted
Date: 2026-09-30

## Context and problem

Task 0405 routes messages by "method, path, header, weight and expression" (spec §11 "Routing and resources"), and spec §11 "Messages" says a message carries protocol details (an HTTP path), `headers` and `sizeBytes`. But behaviour code sends with `ctx.send(port, method, args)` and `ctx.emit(port, method, args)` (spec §8 "Behaviour API"), which set none of these. So no message a component sends has a path or headers for a rule to match. Spec §5 lists routing rules among an edge's props, but no connection type declares a property for them, and nothing defines what an "expression" is. Changing the behaviour API or the built-in connection properties needs the human's decision (CLAUDE.md, "Ask the human first").

## Decision drivers

- Follow spec §5, §8, §9 and §11, and keep existing behaviour code working unchanged.
- The built-in behaviours of 0407 (client, proxy) use only the public plugin API (eng §10). A proxy that forwards by path needs a public way to send a path.
- Expressions must work under the strict CSP and inside the sandbox, so there is no `eval` or `new Function`.
- Routing must stay deterministic: the same seed picks the same edges.

## Considered options

For the protocol details of a sent message:

1. **An optional fourth argument:** `ctx.send(port, method, args, { path, headers, sizeBytes })`, and the same for `ctx.emit`. The receiving method reads `msg.path`, `msg.headers` and `msg.sizeBytes`, and `run.inject` takes the same fields. A message without `sizeBytes` has the edge's `payloadSize`.
2. **Inherited from the request being handled:** messages a method sends carry the path and headers of the message it is handling. The API stays the same, but a component can never set its own path or headers.
3. **No path or header rules yet:** 0405 routes by method, weight and expression only. A later task adds path and header rules once the API has a way to set them.

For where the rules live and how they read (the same for all three options above):

- A `route` property on `base:connection`: a list of strings, like the HTTP type's `methodRules`. Each is one of `method getOrder, listOrders`, `path /orders` (a prefix), `header x-canary = 1`, `weight 30` or `when <expression>`. An edge's `method` field (ADR 0011) counts as a `method` rule.
- A message leaving a port can go on the edges from that port whose rules all hold. If any of those edges has a condition (method, path, header or when), the edges with none drop out, so a specific edge beats a catch-all. If one edge is left, it takes the message. If several are left, a draw weighted by their `weight` picks one; an edge with no weight counts as 1. The draw uses a stream of the port's own. If no edge is left, the send fails with `E_SIM_NO_ROUTE`.
- `when` takes an expression over `msg` (`method`, `path`, `headers`, `body`, `sizeBytes`). It can use literals, member access with `.` and `[…]`, `== != < <= > >=`, `&& || !` and parentheses. An in-house parser reads each expression once, when the run starts, and a malformed one fails with `E_SIM_ROUTE_INVALID`. Conditional breakpoints and watches (spec §13) can reuse the same language.

## Decision outcome

Chosen option: 1 for protocol details, with the `route` property and the in-house expression language described above, decided by the human on 2026-09-30. Components choose their own paths and headers, as real clients and gateways do. The API change is backwards compatible, and the 0407 behaviours can forward paths through it.

## Consequences

- Good: routing by path and header works for the messages components send, and the 0407 client and proxy behaviours can forward paths through the public API.
- Good: existing behaviour code runs unchanged, because the fourth argument is optional.
- Good: a message can have its own size, so transmission delay can differ between a small read and a large upload on the same edge.
- Bad: the behaviour API grows by one optional argument, and spec §8's table needs a line for it.
- Bad: every connection type gains a `route` property (default `[]`), which adds about 0.2 KB to core.
- Follow-up tasks: 0407 (the client and proxy behaviours send paths and headers), 0417 (the facade passes each edge's `method` and `route` to the run), and spec §8 and §11 updates in this task.

## Pros and cons of the options

### Option 1: an optional fourth argument

- Good, because a component decides its own requests' paths and headers, as a real client or gateway does.
- Good, because it is backwards compatible.
- Bad, because it changes the plugin API.

### Option 2: inherited from the request

- Good, because the API is unchanged.
- Bad, because a client or gateway cannot choose a path, so path routing would work only as far as the injected request's path travels.
- Bad, because a service would pass its own inbound path and headers to its database, which no real service does.

### Option 3: no path or header rules yet

- Good, because it is the smallest change now.
- Bad, because 0405 would not meet its goal, and a new task would be needed before 0407.
