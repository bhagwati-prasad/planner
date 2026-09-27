# 0115 Facade handles for recursion

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0114](../M01-core/0114-recursive-fixture.md), [0106](../M01-core/0106-op-log.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md)
- [Engineering §21 Facade and console API design](../../docs/guidelines/engineering/21-facade-and-console-api-design.md)

## Goal

Project, system and component handles for everything M01 added: components opened as systems, their methods and state, method bindings, and edges that name a method. The spec §18 console example runs in Node up to the first simulation call. The human split this task on 2026-09-27: help metadata for every facade method and the `print()` snapshot moved to [0120](../M01-core/0120-facade-help.md).

The starter components declare the public and private method names that spec §9 lists, and their ports expose the public ones, as the human decided on 2026-09-27. Their behaviours, state and cost models stay in M04 (0407–0411).

## Tests to write first

Write these tests first, in `packages/facade/test/facade.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Handles re-read state, so a rename made by command is visible through an older handle
- [ ] A component opened as a system, its methods, its bindings and edges that name a method are reachable from handles
- [ ] The spec §18 console example runs in Node up to the first simulation call

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
