# 0006 Vendored D3 and Three.js with integrity pins

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M00 Foundation and walking skeleton](../ROADMAP.md#m00-foundation-and-walking-skeleton) | R0 | done | [0005](../M00-foundation-and-walking-skeleton/0005-bundler.md), [0007](../M00-foundation-and-walking-skeleton/0007-ci-and-browser-tests.md) |

## Read first

- [Engineering §3 Repository layout](../../docs/guidelines/engineering/03-repository-layout.md)
- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md)

## Goal

Vendor D3 (UMD build) and Three.js (ES module, bundled to an IIFE with our bundler) with SHA-256 pins in `vendor/manifest.json` and their licence files.

## Tests to write first

Write these tests first, in `tools/test/vendor.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] `npm run vendor:verify` fails when any vendored byte changes
- [x] The Three.js IIFE exposes `THREE` when loaded from `file://` in Chromium, Firefox and WebKit
- [x] D3 (ISC) and Three.js (MIT) licence files are present and listed

## Notes

- Ask the human to confirm the exact versions before downloading.

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
