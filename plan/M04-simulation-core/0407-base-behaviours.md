# 0407 Base behaviours

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | todo | [0404](../M04-simulation-core/0404-state-runtime.md), [0405](../M04-simulation-core/0405-edges-network.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Behaviour API
- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md): State and methods

## Goal

Declarative base behaviours with state, public methods and cost models: `base:client`, `service`, `queue`, `topic`, `store`, `cache`, `proxy`, `timer`, `external` and `system`.

## Tests to write first

Write these tests first, in `packages/sim/test/base-behaviours.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each base behaviour answers its public methods using the cost model from its properties
- [ ] A manifest with `extends` and no `entry` simulates without any code
- [ ] An `entry` method overrides the base method of the same name

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
