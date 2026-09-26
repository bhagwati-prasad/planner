# 9. Recursion rules

Recursion (spec §7) is the easiest place to introduce subtle bugs, so all traversal and dispatch go through one resolver.

- Any component instance may own an inner system (`innerSystemRef`). Code never special-cases a "system" type: a `strata.system` component is simply a component whose inner system is required.
- Use `resolveSystem`, `walk(system, visit, { maxDepth })`, `resolveBinding(component, method)` and the roll-up engine. Never follow `innerSystemRef` or boundary bindings by hand.
- Boundary ports mirror the owner's ports one to one. Commands that add, rename or remove a port on a component with an inner system update its boundary ports in the same batch.
- Every public method of a component with an inner system is bound to exactly one public method of a component inside. Unbound methods are reported as problems and fail at run time with `E_METHOD_UNBOUND`.
- Nothing inside an inner system is reachable from outside except through the owner's public methods. The resolver and kernel reject such calls with `E_METHOD_NOT_EXPOSED`.
- Every command that places or re-points an inner system runs the cycle check and fails with `E_SYSTEM_CYCLE`.
- Inner systems placed by reference are read-only in their parent. Commands that target them fail with `E_SYSTEM_READONLY`.
- Roll-ups are memoised per `(systemId, rev)` and invalidated by events. Derived values are never written into the model.
- The resolver enforces a defensive depth limit of 64 (`E_SYSTEM_TOO_DEEP`). The UI warns from depth 8.
- Any feature that touches systems is tested against `fixtures/recursive-payments.strata`. It is three levels deep, with one by-reference and one by-value inner system, plus one component opened as a system that keeps its original behaviour as its black-box model.

---
Part of the [Strata Engineering Guidelines](README.md).
