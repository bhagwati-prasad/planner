<!-- Copy this file into a milestone folder (plan/Mxx-name/). Its links are relative to that location. -->

# NNNN Task title

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [Mxx Milestone name](../ROADMAP.md#mxx-milestone-name) | Rx | todo | [NNNN](../Mxx-folder/NNNN-slug.md) |

## Read first

- [Spec §N Section name](../../docs/spec/NN-section.md): subsection
- [Engineering §N Section name](../../docs/guidelines/engineering/NN-section.md)

## Goal

One or two sentences on what exists when this task is done.

## Tests to write first

Write these tests first, in `packages/<pkg>/test/<file>.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Behaviour one, stated so it can be checked
- [ ] Behaviour two
- [ ] Behaviour three

## Out of scope

- Anything a reader might assume is included but isn't.

## Notes

- Decisions already made, edge cases, pointers.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

Size check: one session, one commit, roughly 100 to 400 changed lines. If it can't fit, split it.
