# 0116 Store property values in canonical units

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0108](../M01-core/0108-units.md) |

## Read first

- [ADR 0008 Store property values in canonical units](../../docs/adr/0008-store-property-values-in-canonical-units.md)
- [Engineering §8 Data, identifiers, units and time](../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md)
- [Engineering §17 Storage and persistence](../../docs/guidelines/engineering/17-storage-and-persistence.md)

## Goal

Commands and the registry store property values in canonical units, as ADR 0008 decided. A snapshot migration converts saved projects, and readers stop converting.

## Tests to write first

Write these tests first, in `packages/core/test/canonical-props.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] `node.setProps` with `'4d'`, `'512 KB'` and a percentage of `99.9` stores 345600000, 512000 and 0.999, and `formatQuantity` writes them back as `4 d`, `512 KB` and `99.9%`
- [x] Manifest defaults written as `'4d'` or `99.9` percent are canonical once the registry normalises the manifest
- [x] A schema-version-1 snapshot fixture migrates to version 2 with canonical values, and an op log written before the change replays to the same state hash as the migrated snapshot
- [x] Roll-ups read canonical values without converting: two components of 99.9% availability in series roll up to 0.998001

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
