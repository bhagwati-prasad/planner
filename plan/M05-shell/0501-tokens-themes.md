# 0501 Design tokens, themes and fonts

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M05 Shell](../ROADMAP.md#m05-shell) | R0 | todo | [0007](../M00-foundation-and-walking-skeleton/0007-ci-and-browser-tests.md) |

## Read first

- [Design system §2 Design direction](../../docs/guidelines/design-system/02-design-direction.md): Typography
- [Design system §3 Design tokens](../../docs/guidelines/design-system/03-design-tokens.md)
- [Design system §15 Theming and implementation](../../docs/guidelines/design-system/15-theming-and-implementation.md)

## Goal

`tokens.json` as the single source; generated `tokens.css` and `tokens.js`; light, dark and contrast themes; system preference; reduced motion; bundled IBM Plex fonts.

## Tests to write first

Write these tests first, in `packages/ui/test/tokens.test.js`, `packages/ui/test/themes.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Generated CSS and JS match `tokens.json` (snapshot)
- [ ] Every text pairing meets its contrast target (computed, not eyeballed)
- [ ] Switching `data-theme` updates computed styles without a reload
- [ ] Fonts load from `file://` and total at most 120 KB

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
