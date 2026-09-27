# 0117 Every node is a typed component

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0110](../M01-core/0110-recursion-resolver.md) |

## Read first

- [ADR 0009 Every node is a typed component that may own an inner system](../../docs/adr/0009-every-node-is-a-typed-component.md)
- [Spec §5 Domain model](../../docs/spec/05-domain-model.md): Graph invariants
- [Engineering §9 Recursion rules](../../docs/guidelines/engineering/09-recursion-rules.md)

## Goal

One kind of node: every node has a `typeRef`, and any node may own an inner system through `innerSystemRef` and `placement`. A placed system is a component of the built-in type `strata.system`. Snapshots move to schema version 3 with a migration.

## Tests to write first

Write these tests first, in `packages/core/test/typed-nodes.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every node has a `typeRef`, and a placed system is a `strata.system` component with `innerSystemRef` and `placement`
- [ ] A schema-version-2 snapshot fixture migrates to version 3, and its op log replays to the same state hash
- [ ] Roll-ups, extract, inline and detach give the same results on the migrated fixture as before the change

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
