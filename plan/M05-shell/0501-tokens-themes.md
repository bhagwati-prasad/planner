# 0501 Design tokens, themes and fonts

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | done | [0007](../M00-foundation-and-walking-skeleton/0007-ci-and-browser-tests.md) |

## Read first

- [Design system §2 Design direction](../../docs/guidelines/design-system/02-design-direction.md): Typography
- [Design system §3 Design tokens](../../docs/guidelines/design-system/03-design-tokens.md)
- [Design system §15 Theming and implementation](../../docs/guidelines/design-system/15-theming-and-implementation.md)

## Goal

`tokens.json` as the single source; generated `tokens.css` and `tokens.js`; light, dark and contrast themes; system preference; reduced motion; bundled IBM Plex fonts.

## Tests to write first

Write these tests first, in `packages/ui/test/tokens.test.js`, `tools/tokens/test/generate.test.js` and `tests/e2e/themes.spec.js` (end-to-end specs are the ones that also run from `file://`, and the generator's test sits with it, since it formats with Prettier, which strata-ui's renamed-source test run cannot reach). Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Generated CSS and JS match `tokens.json` (snapshot)
- [x] Every text pairing meets its contrast target (computed, not eyeballed)
- [x] Switching `data-theme` updates computed styles without a reload
- [x] Fonts load from `file://` and total at most 120 KB

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Source and output.** `packages/ui/tokens/tokens.json` holds primitives, the shared tokens, the typography tokens, four themes (`light`; `dark`; `contrast-light` and `contrast-dark`, each extending light or dark), the reduced-motion values and the bundled faces. `tools/tokens/generate.js` (`npm run generate:tokens`) writes `tokens.css` and `src/tokens.js`, formatted as Prettier would, as the help generator does; semantic tokens name primitives (`var(--st-lapis-600)`) in CSS and resolve to colours in JS.
- **Themes.** `data-theme` chooses light, dark or contrast; without one, the system preference applies. The human chose a contrast theme that follows the system preference too, in a light and a dark form, at 7:1 for text and 3:1 for every border, dividers included. Its values are new in design system §3.
- **Dark tertiary text.** Design system §3's `#8A94A3` reached 4.34:1 on the dark subtle background, under its own 4.5:1 rule. The human chose `#8D97A6`, the nearest step that reaches it.
- **Fonts.** The human chose to vendor IBM Plex Sans 500 and Mono 500, from the same pinned npm packages, checked against their recorded integrity and pinned by SHA-256. The five faces weigh 100.6 KB of the 120 KB budget. The build writes their `@font-face` rules at the top of `strata.css` and copies them to `dist/fonts/`.
- **The shell.** It adopts the generated `TOKENS_CSS`, with the names its elements used before (`--st-bg`, `--st-text` and the rest) mapped onto the semantic tokens, so every theme reaches today's UI. Moving the elements onto the semantic tokens comes with the kit tasks (0502–0504). The canvas re-reads `THEMES` with the canvas adapter (0506).
- **Where the tests live.** The browser test is `tests/e2e/themes.spec.js`, not under `packages/ui/test/`: end-to-end specs are the ones that also run from `file://`. The generation test is `tools/tokens/test/generate.test.js`, beside the generator, as the help generator's is: it formats with Prettier, which the renamed-source run of strata-ui's tests cannot reach. The contrast tests stay in `packages/ui/test/tokens.test.js`.
- **The vendor test.** `tools/test/vendor.test.js` pinned exactly the three faces; with the human's two more, it now pins the five of design system §3.
- **Tests I corrected before green.** The generator formats with Prettier, which writes single quotes in selectors and lower-case hex colours, so the expected selectors use single quotes and the browser test compares colours in upper case.
