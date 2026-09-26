# 1704 Conditional breakpoints

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M17 Visual extras and R2 release](../ROADMAP.md#m17-visual-extras-and-r2-release) | R2 | todo | [1002](../M10-debugger-depth/1002-logs-watches.md) |

## Read first

- [Spec §13 Debugger](../../docs/spec/13-debugger.md)

## Goal

Breakpoint conditions over message, props and state, plus hit counts.

## Tests to write first

Write these tests first, in `packages/debug/test/conditional.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A condition pauses only when true
- [ ] A hit count pauses on the Nth match
- [ ] A throwing condition shows its error and doesn't pause

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
