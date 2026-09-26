# 1103 Reporters and CLI runners

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M11 Tests and architecture rules](../ROADMAP.md#m11-tests-and-architecture-rules) | R1 | todo | [1101](../M11-tests-and-rules/1101-test-runner.md) |

## Read first

- [Spec §18 Headless operation](../../docs/spec/18-headless-operation.md): Node CLI
- [Engineering §19 Git workflow, reviews and releases](../../docs/guidelines/engineering/19-git-workflow-reviews-and-releases.md)

## Goal

Pretty, JSON and JUnit reporters and the `strata run`, `strata test` and `strata lint` commands with correct exit codes.

## Tests to write first

Write these tests first, in `packages/cli/test/run-test.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] `strata test` exits non-zero when any test fails and writes valid JUnit XML
- [ ] `strata run --scope system:payments` runs only that scope
- [ ] `strata lint` runs only static rules and never starts a worker

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
