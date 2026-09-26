# 0004 Test harness, fakes and property-test generators

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | todo | [0001](../M00-foundation-and-walking-skeleton/0001-repo-scaffold.md) |

## Read first

- [Engineering §18 Testing](../../docs/guidelines/engineering/18-testing.md)

## Goal

Shared test utilities: fake clock, fake scheduler, seeded generators, a `property()` helper that shrinks failures and prints the seed, and a fixture loader.

## Tests to write first

Write these tests first, in `tools/testing/test/*.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The fake scheduler runs timers in time order with no real waiting
- [ ] Generators return identical sequences for the same seed and different ones for different seeds
- [ ] A failing property reports its seed and a shrunk counterexample
- [ ] The fixture loader returns fixtures from `test/fixtures` by name and fails clearly for unknown names

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
