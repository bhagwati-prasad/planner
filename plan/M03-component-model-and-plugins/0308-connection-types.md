# 0308 Connection-type plugins

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | done | [0302](../M03-component-model-and-plugins/0302-registry.md) |

## Read first

- [Spec §9 Starter component catalogue](../../docs/spec/09-starter-component-catalogue.md): Connection types

## Goal

The connection-type manifest format and the six built-in types with their properties and defaults.

## Tests to write first

Write these tests first, in `packages/plugins/test/connection-types.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] All six built-in connection types validate and register
- [x] Each type's properties have units and defaults
- [x] A connection type can declare which component ports it may join

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
