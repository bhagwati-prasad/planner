# 0102 StrataError and the error code registry

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M01 Core](../ROADMAP.md#m01-core) | R0 | todo | [0101](../M01-core/0101-state-helpers.md) |

## Read first

- [Engineering §14 Errors, async code and logging](../../docs/guidelines/engineering/14-errors-async-code-and-logging.md)

## Goal

`StrataError` with code, message, userMessageKey, details and cause; `ok()` and `err()` results; a registry of codes with one-line descriptions.

## Tests to write first

Write these tests first, in `packages/core/test/errors.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Creating an error with an unregistered code throws in development builds
- [ ] `err()` results carry code and plain-data details and serialise to JSON
- [ ] Every registered code has a description and a user message key

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
