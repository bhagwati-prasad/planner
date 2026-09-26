# 1104 Tests panel and form authoring

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M11 Tests and architecture rules](../ROADMAP.md#m11-tests-and-architecture-rules) | R1 | todo | [1101](../M11-tests-and-rules/1101-test-runner.md), [1001](../M10-debugger-depth/1001-trace-waterfall.md) |

## Read first

- [Spec §14 Testing and architecture rules](../../docs/spec/14-testing-and-architecture-rules.md)
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md)

## Goal

The Test mode panel with form authoring for functional, method, SLO and resilience tests, and results that open the debugger at the violating trace.

## Tests to write first

Write these tests first, in `packages/ui/test/tests-panel.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A method test built in the form runs with its neighbours stubbed
- [ ] Clicking a failed SLO test opens the run paused at the violating trace
- [ ] Results persist with the project

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
