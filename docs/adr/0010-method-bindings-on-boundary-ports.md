# 0010 Method bindings live on boundary ports

Status: Proposed
Date: 2026-09-27

## Context and problem

Task 0111 binds each public method of a composite to a public method of a component inside it. The spec says what a binding means but not all of how it is kept:

- Spec §6 and §8: a manifest declares `methods.public` and `methods.private`, and each port lists the public methods it `exposes`. The registry passes both through today without checking them, and no starter component declares them yet.
- Spec §5: a boundary port carries "method bindings".
- Spec §7: each public method of the owner is bound to exactly one public method of a component inside, "reachable from the matching boundary port". Unbound methods appear in Problems, and fail with `E_METHOD_UNBOUND` in an expanded run.
- Eng §9: code finds bindings through `resolveBinding(component, method)`, never by hand.

Four points are left open:

- where the public methods of a System component come from, since it has no manifest methods;
- what "reachable" means;
- what happens to a binding when its target goes away;
- how the new field reaches saved projects, which changes what snapshots store (CLAUDE.md, "Ask the human first").

## Decision drivers

- Follow spec §5, §6, §7 and §8 as written, and keep eng §9's one resolver.
- Bindings must survive by-reference placement: a library system placed in several parents has one set of bindings.
- Saved projects and op logs keep opening and replaying (eng §8 migrations).
- Keep 0111 to what its three tests need. Extract and inline (0112) and the kernel (M04) build on it.

## Considered options

1. **Bindings on boundary ports, keyed by method.**
   - The boundary port that mirrors an owner port holds `bindings: { [method]: { nodeId, method } }`, one entry for each method that port exposes.
   - A method exposed on two ports is bound once on each, because traffic from each port enters the inner system at a different place.
2. **Bindings on the owner component**, as `bindings: { [method]: { nodeId, method } }` on the node. This is simpler, but it disagrees with spec §5. It also breaks by-reference placement: each placement would need its own copy of what is really a property of the shared library system.
3. **Bindings as edges** from a boundary port to the target component, with a `method` field. This reuses the edge machinery, but spec §5 says edges connect ports on two different components. A binding is not traffic, so every edge consumer would need to skip it.

## Decision outcome

Proposed: option 1, together with these rules.

- **Methods in manifests.** The registry checks `methods.public` and `methods.private`: each is an object of method names to objects, and no name is both public and private. It also checks that each port's `exposes` names public methods. The plugins validator reports the same problems. Manifests without methods stay valid.
- **The public methods of a System component** (`strata.system`, ADR 0009) are the methods bound on its boundary ports. Binding a method on a System's boundary port is how the System declares it, which is what extract (spec §7, task 0112) produces. Because every placement shares the one inner system, a library system has the same methods wherever it is placed.
- **Reachable** means one of two things:
  - the component that owns the boundary port's internal port;
  - any component reached from it by following edges in their direction, where an edge from an `out` or `both` port leads to the other end, and `both` works both ways.

  A boundary port with no internal port reaches nothing.
- **Commands:**
  - `boundary.bind { boundaryPortId, method, nodeId, target }` refuses:
    - with `E_METHOD_NOT_EXPOSED`, when the owner's matching port does not expose the method; this does not apply to a System, which declares methods by binding them;
    - with `E_METHOD_UNREACHABLE`, when the target component is not reachable;
    - with `E_METHOD_UNKNOWN`, when the target has no such public method.
  - `boundary.unbind { boundaryPortId, method }` removes a binding.
  - Both are undoable.
  - Removing a component removes the bindings that target it, in the same batch.
- **`resolveBinding(nodeId, method, { port })`** follows bindings down through every level to the component that implements the method. It returns `{ nodeId, method, path }`, and fails with `E_METHOD_UNBOUND` at the first composite that has no binding. A component without an inner system resolves to itself. `port` picks the exposing port when there are several; it defaults to the first.
- **Problems:** `E_METHOD_UNBOUND` for each exposed public method of a composite whose boundary port has no binding for it. `E_METHOD_UNREACHABLE` for a binding whose target is no longer reachable, for example after an edge was removed.
- **Saved projects:** snapshot schema version 4. `migrations/v3-to-v4.js` gives every boundary port `bindings: {}`. Op logs replay unchanged, since no existing command changes.

## Consequences

- Good: bindings sit where spec §5 puts them, and library systems keep one set of bindings however often they are placed.
- Good: System components get public methods without a manifest, which extract (0112) needs.
- Bad: a new snapshot version and migration, with fixtures recorded by the version-3 code.
- Bad: plugin manifests with badly shaped `methods` or `exposes`, which load today, are refused. No starter component declares them, so none is affected.
- Follow-up tasks: 0112 creates bindings when it extracts and removes them when it inlines. The kernel (M04) dispatches through `resolveBinding`, and 0115 adds bind and unbind to the facade.

## Pros and cons of the options

### Option 1: bindings on boundary ports

- Good, because it matches spec §5 and by-reference placement.
- Bad, because a method exposed on several ports needs a binding on each.

### Option 2: bindings on the owner component

- Good, because there is one place to look.
- Bad, because it contradicts spec §5 and copies a library system's bindings into every placement.

### Option 3: bindings as edges

- Good, because it reuses edge storage and rendering.
- Bad, because a binding carries no traffic, so every edge consumer would need to skip it.
