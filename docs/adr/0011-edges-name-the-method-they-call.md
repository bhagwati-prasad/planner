# 0011 Edges name the method they call

Status: Accepted
Date: 2026-09-27

## Context and problem

Task 0112 makes extract turn "the methods called across [the crossing] edges into bound public methods" of the new System (spec §7). Spec §6 says "an edge can be bound to one method (`method: 'publish'`), and the edge label then shows the method name". A message that names no method runs the port's default method. Spec §5 lists "method binding" among an edge's fields.

Edges store no method today, so extract cannot know which methods cross a boundary. Adding one changes what snapshots store and what `edge.add` and `edge.update` accept (CLAUDE.md, "Ask the human first"). Spec §6 does not define a port's "default method" either.

## Decision drivers

- Follow spec §5, §6 and §7, and keep ADR 0010's bindings as the one way methods cross a boundary.
- Extract must yield a System whose public methods are what the parent actually calls, and `inline(extract(x))` must equal `x` (task 0112's property).
- Keep saved projects and op logs opening (eng §8).

## Considered options

1. **A `method` field on edges.**
   - Every edge has `method: string | null`, and `edge.add` and `edge.update` accept it. When set, the method must be one the target port exposes (`E_METHOD_NOT_EXPOSED`), so an edge into a System component can name only a method that System has bound.
   - Extract binds, for each edge entering the selection:
     - an edge that names a method: that method, to the same method of the component inside;
     - an edge that names none: every method the inner port exposes, each under its own name.
   - Edges leaving the selection add no methods, because there the System is the caller.
2. **The method as an edge property,** `props.method`, next to the connection type's properties (timeout, retries). It needs no new field, but connection-type validation reports it as an unknown property. It would also mix what an edge is for with how it is carried.
3. **No method on edges yet.** Extract binds every method that each entered inner port exposes. This is the smallest change, but a System would gain methods the parent never calls, and spec §6's edge method would still be missing.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-27, together with shipping 0111 and 0112 in one pull request. For the "default method" of spec §6, an edge that names none may call any method the target port exposes, which is why extract binds them all. The kernel (M04) decides which one runs.

Snapshots gain `method: null` on every edge. Schema version 4 (ADR 0010) has not shipped yet, so its migration, `migrations/v3-to-v4.js`, also adds the field, and there is no version 5. 0111 and 0112 ship in the same pull request, so that holds.

## Consequences

- Good: extract knows exactly which methods cross the boundary, and edge labels can show them (spec §6).
- Good: `E_METHOD_NOT_EXPOSED` is checked when an edge is drawn, not first in a run.
- Bad: one more field on edges and in their commands, and the facade's `connect` gains a `method` option in 0115.
- Follow-up tasks: 0112 (extract binds, inline keeps edge methods), 0115 (facade `connect(…, { method })`), and M04 (the kernel routes `msg.method` and the default method).

## Pros and cons of the options

### Option 1: a `method` field on edges

- Good, because it is what spec §5 and §6 describe, and extract can be exact.
- Bad, because it adds a field to a persisted entity.

### Option 2: `props.method`

- Good, because it needs no new field.
- Bad, because connection-type validation and the inspector would treat it as a connection property.

### Option 3: no method on edges yet

- Good, because it is the smallest change.
- Bad, because extracted Systems over-declare methods, and spec §6 stays unimplemented.
