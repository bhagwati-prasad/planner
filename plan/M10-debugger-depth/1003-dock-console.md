# 1003 In-app console

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M10 Debugger depth](../ROADMAP.md#m10-debugger-depth) | R1 | todo | [0417](../M04-simulation-core/0417-facade-sim.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md)

## Goal

A dock Console tab for facade commands, with history, completion from help metadata and `console.table` output.

## Tests to write first

Write these tests first, in `packages/ui/test/console.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Commands typed in the Console tab act on the open project, and the canvas updates
- [ ] Completion suggests facade methods from their help metadata
- [ ] `toTable()` results render as tables

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
