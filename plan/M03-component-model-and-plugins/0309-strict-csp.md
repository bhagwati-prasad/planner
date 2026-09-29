# 0309 Strict CSP: styles without inline style elements or attributes

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M03 Component model and plugins](../ROADMAP.md#m03-component-model-and-plugins) | R0 | todo | [0306](../M03-component-model-and-plugins/0306-serve.md) |

Split from 0306, as the human decided on 2026-09-29.

## Read first

- [Engineering §16 Security](../../docs/guidelines/engineering/16-security.md): Local server
- [Engineering §11 Web Components and UI code](../../docs/guidelines/engineering/11-web-components-and-ui-code.md)
- [Engineering §12 strata-graph and strata-3d](../../docs/guidelines/engineering/12-strata-graph-and-strata-3d.md)

## Goal

`strata serve` sends exactly the CSP of eng §16, whose `style-src 'self'` allows no inline styles, and the app still looks and works the same. Today the server sends `style-src 'self' 'unsafe-inline'`, because the UI elements and strata-graph style themselves with inline `<style>` elements and `style` attributes: under the strict policy the browser refuses 15 of them.

The work:
- the UI elements and strata-graph adopt their stylesheets as constructable stylesheets (`adoptedStyleSheets`) on their shadow roots or document;
- they set style properties through the CSSOM (`element.style.setProperty`), which the policy allows;
- they set no `style` attribute and add no `<style>` element to the live page.

An exported SVG keeps its inline `<style>`, since it is a standalone document.

## Tests to write first

Write these tests first. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Every response of `strata serve` carries exactly the CSP that eng §16 names, read from the guideline (`packages/server/test/serve.test.js`)
- [ ] The app, served with that CSP, starts, draws its sample project and reports no CSP violation (`tests/e2e/csp.spec.js`, served mode)
- [ ] strata-graph renders a diagram with no `<style>` element or `style` attribute in the live page, and its visual snapshots are unchanged (`packages/graph/test/`)

## Notes

- Constructable stylesheets are not inline styles, so `style-src 'self'` does not block them. Neither do CSSOM property changes.
- Visual snapshot baselines must not change. If one does, stop and show the human the screenshots.
- strata-graph measures 110.6 KB of its 115 KB (ADR 0016); strata-ui 78.7 KB of its 230 KB (ADR 0017).

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
