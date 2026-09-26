# 0007 CI pipeline and browser test harness

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | in progress | [0002](../M00-foundation-and-walking-skeleton/0002-dev-tooling.md), [0003](../M00-foundation-and-walking-skeleton/0003-custom-lint-rules.md), [0004](../M00-foundation-and-walking-skeleton/0004-test-harness.md), [0005](../M00-foundation-and-walking-skeleton/0005-bundler.md) |

## Read first

- [Engineering §15 Performance budgets](../../docs/guidelines/engineering/15-performance-budgets.md)
- [Engineering §18 Testing](../../docs/guidelines/engineering/18-testing.md)
- [Engineering §19 Git workflow, reviews and releases](../../docs/guidelines/engineering/19-git-workflow-reviews-and-releases.md)

## Goal

Playwright configured for Chromium, Firefox and WebKit in both served and `file://` modes; a harness page that mounts one custom element for component tests; `npm run check` running every gate; a CI workflow running the same steps.

## Tests to write first

Write these tests first, in `tools/test/ci.test.js`, `tests/e2e/smoke.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] A smoke test opens `dist/strata.html` from `file://` and from a local static server in all three browsers
- [x] `npm run check` runs format, lint, typecheck, unit tests, build, browser tests, size and licence checks in order
- [x] The size check fails when a fixture bundle exceeds its eng §15 budget

## Notes

- Assume GitHub Actions unless the human says otherwise. The human creates the remote repository.

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Remaining

Done so far: `npm run check` (`tools/ci/check.js`) runs the gates in order and stops at the first failure; the size check (`tools/ci/size.js`) reads the eng §15 budgets, and the licence check is `tools/ci/licence.js`. Tests are in `tools/test/ci.test.js`, and the gates are described in `tools/ci/README.md`. The browser gate still runs the existing node:test browser files in Chromium.

Waiting on the human: `@playwright/test` as a pinned development dependency. Eng §16 approves Playwright, but CLAUDE.md asks before any dependency is added. 1.56.1 matches the Chromium build already installed in the cloud container. Once it is approved:

- [ ] `playwright.config.js` with Chromium, Firefox and WebKit projects, each in served and `file://` modes, and a global setup that builds `dist/`
- [ ] `tests/e2e/smoke.spec.js`: opens `dist/strata.html` from `file://` and from the local server in every project
- [ ] A harness page in `tools/testing/browser/` that mounts one custom element, with Playwright fixtures and a spec of its own
- [ ] The browser gate runs `playwright test` before the node:test browser files
- [ ] `.github/workflows/ci.yml`: `npm ci --ignore-scripts`, install the three browsers, then `npm run check`

Found on the way: the pre-plan strata-graph package is 98.5 KB minified against its 60 KB budget. It is recorded in `tools/ci/size-exceptions.json`, owned by 0207, and may not grow. Core, facade and the non-UI packages come to 233.4 KB of 250 KB with the in-house minifier, which does not mangle names, so M01 will likely reach that budget.
