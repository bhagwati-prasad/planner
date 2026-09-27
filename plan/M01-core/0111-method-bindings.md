# 0111 Method bindings across boundaries

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0110](../M01-core/0110-recursion-resolver.md) |

How bindings are stored, what a System component's methods are, and what "reachable" means are decided in [ADR 0010](../../docs/adr/0010-method-bindings-on-boundary-ports.md).

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): Public methods
- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Boundary ports and method bindings
- [Engineering §9 Recursion rules](../../docs/guidelines/engineering/09-recursion-rules.md)

## Goal

Bind each public method of an owner to one public method of an inner component; `resolveBinding`; problems for unbound methods.

## Tests to write first

Write these tests first, in `packages/core/test/bindings.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Binding to a component not reachable from the matching boundary port fails
- [x] An unbound public method appears in `problems()`
- [x] `resolveBinding` follows bindings through three levels to the implementing component

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
