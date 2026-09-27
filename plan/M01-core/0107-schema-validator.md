# 0107 Schema validator for properties and state

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0102](../M01-core/0102-errors.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): State
- [Spec §8 Component plugin model](../../docs/spec/08-component-plugin-model.md): Manifest
- [Engineering §8 Data, identifiers, units and time](../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md)

## Goal

In-house validator for property and state values: all property types with units, all distribution kinds, and the state types queue, list, map and table.

## Tests to write first

Write these tests first, in `packages/core/test/schema.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Every property and state type accepts valid values and rejects invalid ones with a path to the error
- [x] `"4d"` parses to milliseconds and `"512 KB"` to bytes
- [x] Every distribution kind validates its parameters

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
