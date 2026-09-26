# 1101 Test DSL and runner

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M11 Tests and architecture rules](../ROADMAP.md#m11-tests-and-architecture-rules) | R1 | todo | [0802](../M08-scenarios-and-load/0802-load-profiles.md) |

## Read first

- [Spec §14 Testing and architecture rules](../../docs/spec/14-testing-and-architecture-rules.md)

## Goal

The `test()` and `rule()` DSL, the shared JSON test spec, suites and tags, multi-seed runs, and a runner that works in the worker and in Node.

## Tests to write first

Write these tests first, in `packages/test/test/runner.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A test written in code and the same test built as JSON give identical results
- [ ] Tags select subsets; `--seeds 5` runs five seeds and reports flaky results
- [ ] Every simulated test must declare a scope, or it fails validation

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
