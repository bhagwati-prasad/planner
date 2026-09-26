# 0101 Immutable state and structural sharing

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | done | [0008](../M00-foundation-and-walking-skeleton/0008-skeleton-core.md) |

## Read first

- [Engineering §7 State, commands and events](../../docs/guidelines/engineering/07-state-commands-and-events.md)
- [Engineering §8 Data, identifiers, units and time](../../docs/guidelines/engineering/08-data-identifiers-units-and-time.md)

## Goal

Entity maps keyed by id with `setIn`, `updateIn` and `removeIn` helpers that share structure, plus deep freeze in development builds.

## Tests to write first

Write these tests first, in `packages/core/test/state.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] `setIn` returns a new root and keeps untouched branches identical by reference
- [x] Mutating committed state throws in development builds
- [x] Property: random sequences of `setIn` and `removeIn` never mutate the original

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
