# 1002 Logs and watches

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M10 Debugger depth](../ROADMAP.md#m10-debugger-depth) | R1 | todo | [0416](../M04-simulation-core/0416-breakpoints-inspection.md) |

## Read first

- [Spec §13 Debugger](../../docs/spec/13-debugger.md)

## Goal

Per-component log consoles with level and text filters, and watch expressions re-evaluated at each pause.

## Tests to write first

Write these tests first, in `packages/debug/test/logs.test.js`, `packages/ui/test/logs.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] `ctx.log` output appears in the right component's console with its simulated time
- [ ] A watch updates when stepping back and forward
- [ ] A watch that throws shows its error without breaking the run

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
