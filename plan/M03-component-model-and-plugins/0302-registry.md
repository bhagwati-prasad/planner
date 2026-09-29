# 0302 Component registry and versions

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | done | [0301](../M03-component-model-and-plugins/0301-manifest-schema.md) |

## Read first

- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Versioning and other plugin kinds

## Goal

Register component types by `id@version`; let versions coexist; load unknown types as placeholders that keep properties and state; refuse bundles with bad integrity.

## Tests to write first

Write these tests first, in `packages/plugins/test/registry.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Two versions of one id coexist and pinned versions resolve correctly
- [x] A project using an unknown type loads with placeholders and loses no data
- [x] A bundle whose integrity hash does not match is refused

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
