# 0103 Injected id, clock, PRNG, scheduler and logger adapters

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0102](../M01-core/0102-errors.md) |

## Read first

- [Engineering §6 Architecture and dependency rules](../../docs/guidelines/engineering/06-architecture-and-dependency-rules.md)
- [Engineering §8 Data, identifiers, units and time](../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md)

## Goal

Adapter interfaces with real and fake implementations: ULID generator, clock, seeded PRNG, scheduler and logger, each with a contract suite.

## Tests to write first

Write these tests first, in `packages/core/test/adapters.test.js`, `tools/contracts/*.contract.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] 10,000 ULIDs generated in one millisecond are unique and sorted
- [x] With the fake clock and a seeded PRNG, ULIDs are reproducible
- [x] Real and fake implementations both pass their contract suites

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
