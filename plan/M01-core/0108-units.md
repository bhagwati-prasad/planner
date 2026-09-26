# 0108 Canonical units and conversions

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0107](../M01-core/0107-schema-validator.md) |

## Read first

- [Engineering §8 Data, identifiers, units and time](../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md)
- [Design system §11 Content and voice](../../docs/guidelines/design-system/11-content-and-voice.md): Formatting numbers and units

## Goal

Conversions to and from canonical internal units, used by manifests, import and the UI formatter.

## Tests to write first

Write these tests first, in `packages/core/test/units.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Every row of the eng §8 units table converts both ways
- [x] Percentages are stored as fractions and money as integer micro-units with a currency code
- [x] Property: `parse(format(x))` equals `x` for every supported unit

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
