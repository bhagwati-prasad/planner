# 0210 Visual snapshot harness

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M02 strata-graph](../ROADMAP.md#m02-strata-graph) | R0 | todo | [0202](../M02-strata-graph/0202-shapes-ports.md) |

Added by the human on 2026-09-27, before the first visual snapshots (0209, 0203).

## Read first

- [Engineering §18 Testing](../../docs/guidelines/engineering/18-testing.md): the visual row
- [Engineering §1 How to read this document](../../docs/guidelines/engineering/01-how-to-read-this-document.md): vendored IBM Plex keeps its OFL licence
- [Design system §2 Design direction](../../docs/guidelines/design-system/02-design-direction.md): Typography
- [`vendor/README.md`](../../vendor/README.md)

## Goal

Visual snapshots that give the same pixels on every machine. IBM Plex Sans (regular and semibold) and IBM Plex Mono (regular), as their Latin-1 woff2 files, are vendored in `vendor/plex` with the OFL, pinned like the other libraries. The browser test harnesses load them before any test starts, so text measures and renders the same everywhere. Tests tagged `@visual` run in Chromium only, the reference browser of eng §15, and compare screenshots at eng §18's 0.1% threshold. This task creates no baselines: they come with the first visual tests, after the human approves the screenshots.

## Tests to write first

Write these tests first. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Visual tests run in Chromium only and compare screenshots at a 0.1% pixel threshold (`tools/test/ci.test.js`)
- [ ] The strata-graph test harness renders text in IBM Plex Sans from `vendor/plex` (`packages/graph/test/fonts.spec.js`)
- [ ] `vendor/plex` pins the three fonts and the OFL licence (`tools/test/vendor.test.js`)

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
