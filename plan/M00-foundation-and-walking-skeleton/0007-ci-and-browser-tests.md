# 0007 CI pipeline and browser test harness

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | done | [0002](../M00-foundation-and-walking-skeleton/0002-dev-tooling.md), [0003](../M00-foundation-and-walking-skeleton/0003-custom-lint-rules.md), [0004](../M00-foundation-and-walking-skeleton/0004-test-harness.md), [0005](../M00-foundation-and-walking-skeleton/0005-bundler.md) |

## Read first

- [Engineering §15 Performance budgets](../../docs/guidelines/engineering/15-performance-budgets.md)
- [Engineering §18 Testing](../../docs/guidelines/engineering/18-testing.md)
- [Engineering §19 Git workflow, reviews and releases](../../docs/guidelines/engineering/19-git-workflow-reviews-and-releases.md)

## Goal

Playwright configured for Chromium, Firefox and WebKit in both served and `file://` modes; a harness page that mounts one custom element for component tests; `npm run check` running every gate; a CI workflow running the same steps.

## Tests to write first

Write these tests first, in `tools/test/ci.test.js`, `tests/e2e/smoke.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] A smoke test opens `dist/strata.html` from `file://` and from a local static server in all three browsers
- [x] `npm run check` runs format, lint, typecheck, unit tests, build, browser tests, size and licence checks in order
- [x] The size check fails when a fixture bundle exceeds its eng §15 budget

## Notes

- Assume GitHub Actions unless the human says otherwise. The human creates the remote repository.

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

