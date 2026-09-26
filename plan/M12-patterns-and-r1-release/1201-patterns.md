# 1201 Patterns library

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M12 Patterns and R1 release](../ROADMAP.md#m12-patterns-and-r1-release) | R1 | todo | [0509](../M05-shell/0509-depth-navigation.md) |

## Read first

- [Spec §7 Recursion: drill-down and roll-up](../../docs/spec/07-recursion-drill-down-and-roll-up.md): Structural roll-up, Placement modes

## Goal

Save any system as a pattern and place it by reference or by value.

## Tests to write first

Write these tests first, in `packages/core/test/patterns.test.js`, `packages/ui/test/patterns.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Placing a pattern by reference keeps it read-only and version-pinned
- [ ] Placing by value creates an editable copy with new ids
- [ ] Patterns appear in the library under their own category

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
