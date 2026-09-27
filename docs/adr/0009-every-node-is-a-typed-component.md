# 0009 Every node is a typed component that may own an inner system

Status: Proposed
Date: 2026-09-27

## Context and problem

Spec §5 says every node is a component with a component type (`typeRef`), with no untyped nodes, and that a component instance may have an inner system (`innerSystemRef`). Spec §7 lets any component be opened as a system: its ports become the inner system's boundary ports, and it keeps its behaviour as its black-box model. Eng §9 says code never special-cases a "system" type.

The model built before the plan has two kinds of node:

- `atomic` nodes have a `typeRef` and never an inner system.
- `composite` nodes have `typeRef: null`, a `systemRef` and a `placement`.

A composite's ports mirror its system's boundary ports, so the system is the source of truth. That lets several composites place one library system by reference.

Task 0110 asks for `component.openAsSystem`, and for boundary ports that follow the owner's ports. The current model cannot express either without a second kind of inner-system owner. Changing it changes what snapshots store and what commands create (CLAUDE.md, "Ask the human first").

## Decision drivers

- Spec §5, §7 and eng §9: one kind of node, typed, able to own an inner system.
- Library systems placed by reference in several parents must keep working (spec §7, placement modes).
- Saved projects and op logs must still open and replay (eng §8 migrations, eng §7 command versions).
- Keep the change reviewable. Much of 0110 (the resolver, `walk`, the cycle, depth and read-only guards) does not depend on it.

## Considered options

1. **Unify.**
   - Every node has a `typeRef`. `innerSystemRef` and `placement` are optional on any node, and `kind` is dropped, because a node is composite when it has an inner system.
   - A placed system becomes a component of the built-in type `strata.system@1.0.0`, whose black-box model is its contract.
   - `component.openAsSystem` gives any component an inner system of its own. Its boundary ports mirror the component's ports, and port commands on the owner update them in the same batch.
   - A system placed by reference keeps its boundary ports as the source, and every placement mirrors them, as today.
   - A snapshot migration, v2 to v3, turns composites into `strata.system` components.
2. **Add an inner system to atomic nodes only.** Composites stay as they are, and atomic nodes gain `innerSystemRef` for "open as system". This leaves two kinds of inner-system owner, which eng §9 forbids.
3. **Only `strata.system` nodes own inner systems.** This drops "open any component as a system", against spec §7.

## Decision outcome

Proposed: option 1. It is what spec §5 and §7 describe, it removes the `atomic` and `composite` special cases instead of adding a third, and it keeps by-reference placement.

## Consequences

- Good: one node shape everywhere. Roll-ups, the resolver and the simulation treat a composite as a component that happens to have an inner system.
- Good: "open as system", the generic System component, and a component's own behaviour as its black-box model (spec §7) follow directly.
- Bad: about 30 sites across core, the facade and the UI read `kind` or `systemRef` and change with it. The existing recursion tests are rechecked against the new shape.
- Bad: saved projects need `migrations/v2-to-v3.js`, with fixtures in `test/fixtures/schema-v2/`.
- Bad: `node.place` still takes the same payload but creates a `strata.system` component. Op logs replay unchanged. Undo payloads recorded before v3 would hold old node shapes, but op logs are not persisted until M06, so none exist.
- Proposed split of task 0110:
  - **0110**, as planned but without its first two tests: `resolveSystem`, `walk` with `maxDepth`, and the guards `E_SYSTEM_CYCLE`, `E_SYSTEM_READONLY` and `E_SYSTEM_TOO_DEEP`. It works on either model.
  - **0117 Every node is a typed component**, after this ADR: the unified node, the `strata.system` built-in, the v2-to-v3 migration and its fixtures.
  - **0118 Open a component as a system**, after 0117: `component.openAsSystem`, and boundary ports that follow the owner's ports. These are the first two tests of the current 0110.

## Pros and cons of the options

### Option 1: unify

- Good, because it matches the spec and the recursion rules.
- Bad, because it is a broad change with a migration.

### Option 2: inner systems on atomic nodes too

- Good, because it is smaller and needs no migration.
- Bad, because every recursive feature then handles two kinds of owner, the bug eng §9 warns about.

### Option 3: only System components own inner systems

- Good, because it is the smallest change.
- Bad, because it drops a headline feature of spec §7.
