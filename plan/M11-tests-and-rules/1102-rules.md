# 1102 Architecture rules

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M11 Tests and architecture rules](../ROADMAP.md#m11-tests-and-architecture-rules) | R1 | todo | [1101](../M11-tests-and-rules/1101-test-runner.md) |

## Read first

- [Spec §14 Testing and architecture rules](../../docs/spec/14-testing-and-architecture-rules.md)
- [Engineering §10 Plugins and components](../../docs/guidelines/engineering/10-plugins-and-components.md)

## Goal

Built-in rules (no single point of failure, no shared databases, gateway-only ingress, DLQ on every queue, owner on every component, contract mismatches) re-run on save and shown in Problems and on the canvas.

## Tests to write first

Write these tests first, in `packages/test/test/rules.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Each rule has a fixture that passes and one that fails
- [ ] Rule failures show as canvas markers and Problems entries within 200 ms of a save
- [ ] Custom rules load as plugins

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
