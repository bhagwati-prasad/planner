# CI gates

`npm run check` runs `check.js`: every gate eng §19 lists that exists so far, in order, stopping at the first failure. The CI workflow (`.github/workflows/ci.yml`) installs the three browsers and runs the same script, so a green local check means a green pipeline.

| Gate | Runs | Notes |
| --- | --- | --- |
| `format` | `tools/checks.js format:check` | Prettier, eng §5 |
| `lint` | `tools/checks.js lint`, `scripts/check-boundaries.js` | ESLint with the `strata` rules (`tools/lint`), then the package boundary check |
| `typecheck` | `tools/checks.js typecheck` | `tsc` over `packages/*/src` |
| `unit` | `scripts/run-tests.js` | Every Node test: unit, property, contract and determinism |
| `build` | `scripts/build.js` | `dist/`, including the offline `strata.html` |
| `browser` | `scripts/run-browser-tests.js` | Playwright specs in Chromium, Firefox and WebKit, served and from `file://` (`playwright.config.js`), then the older node:test browser files in Chromium. `STRATA_BROWSERS=chromium` limits a local run to the browsers you have installed |
| `size` | `tools/ci/size.js` | Bundle budgets, eng §15 |
| `licence` | `tools/ci/licence.js` | Dependency and vendored licences, eng §1 and §16 |

## Size

`size.js` reads the budgets from the eng §15 table, so a budget changed there (through an ADR) changes the check. Each budget is measured the way the build ships the code: every source file minified by `packages/plugins`' minifier, with local names shortened (`minify(code, { rename: true })`), summed, with 1 KB = 1,000 bytes.

| Budget | Measures |
| --- | --- |
| Core, facade and non-UI packages | `src/` of every package except graph, 3d and ui (the views) and cli and server (Node only), without the console help metadata |
| strata-graph | `packages/graph/src` |
| strata-ui | `packages/ui/src` |
| Simulation worker bundle | The bundle the build makes from `packages/sim/src/worker/main.js`, with everything it imports (reported as not built until the entry exists) |
| Bundled fonts | every `.woff2` in `packages/ui` and `vendor/` |
| Console help metadata | `packages/facade/src/help-data.js`, generated from the facade's JSDoc (`tools/help`); text, not code, so it has its own line ([ADR 0013](../../docs/adr/0013-console-help-metadata-has-its-own-budget.md)) |

A budget that existing code already exceeds is recorded in `size-exceptions.json` with the measured size and the task that brings it within budget. The measure may shrink but not grow past the recorded size, and the check fails once the exception is no longer needed, so the file only shrinks. `tools/test/ci.test.js` keeps it to eng §15 budgets with an owner.

| Budget | Recorded | Removed by |
| --- | --- | --- |
| Simulation worker bundle | 157.6 KB of 120 KB | 0402 (worker host). Shortening local names (0119) lowered it from 168.6 KB to 138.3 KB; method bindings (0111), extract planning (0112), memoised roll-ups (0113) and manifest checks (0301) raised it as core grew |

strata-graph had an exception here until [ADR 0014](../../docs/adr/0014-strata-graph-budget-of-110-kb.md) set its budget at 110 KB and strata-ui's at 240 KB, as the human decided on 2026-09-28. It was over 60 KB before M02's tasks began (75.8 KB after 0119 shortened local names). The scene, cards, node states, edges, interaction, guides, frames and annotations of 0201 to 0206 then took it to 97.6 KB.

The worker's own code is small. It reaches `core` through `core`'s `index.js`, which eng §4 requires, and the bundler has no tree-shaking, so all of `core` comes with it. Fixing it means either re-export pruning in the bundler or a leaner worker entry into `core`, which needs an ADR. Until then, as the human decided on 2026-09-26, a task that grows `core` raises this recorded size to what it ships, and says so in its `plan/LOG.md` line.

Core, facade and the non-UI packages measure 246.8 KB of their 250 KB, and the console help metadata 19.0 KB of its 25 KB. Task 0118 took them to 250.7 KB, and 0119 brought them back by shortening local names. As the human decided on 2026-09-27, the same policy applies when a task takes them past 250 KB again: the task records an exception at the size they reach and says so in its `plan/LOG.md` line. It also proposes the task that brings them back within budget, which the exception names as its owner.

## Licences

`licence.js` checks what comes from elsewhere; Strata's own code is proprietary (eng §1). Every package in `package-lock.json` must declare a licence on the permissive allow-list in `licence.js` (for an SPDX `OR`, one side is enough). Every folder in `vendor/` must be a library eng §16 approves (D3, Three.js, IBM Plex) and hold a licence file with the licence eng §1 names: ISC, MIT and OFL-1.1.
