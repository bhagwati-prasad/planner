# 0303 Behaviour contract and component test harness

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | done | [0301](../M03-component-model-and-plugins/0301-manifest-schema.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Behaviour API
- [Engineering §10 Plugins and components](../../docs/guidelines/engineering/10-plugins-and-components.md): State and methods, Behaviour code

## Goal

The `ctx` interface as JSDoc types, validation of behaviour modules (`public`, `private`, hooks), and `createTestContext()` so component authors can unit-test methods without the kernel.

## Tests to write first

Write these tests first, in `packages/plugins/test/behaviour.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A behaviour whose `public` keys don't match the manifest fails validation
- [x] `createTestContext()` records `send`, `emit`, `call`, `fail` and state changes for assertions
- [x] Module-level mutable state in a behaviour is flagged by the validator

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
