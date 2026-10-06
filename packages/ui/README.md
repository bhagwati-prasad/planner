# strata-ui

The workspace: the view adapter between the model and strata-graph (headless) and the Web Components shell in `src/elements/`.

- Runs in: Browser
- Specification: spec §10, §18
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`

## Design tokens

`tokens/tokens.json` is the one source of the design tokens (design system §3, §15, task 0501): primitives, the shared tokens (fonts, type, space, sizes, strokes, radii, motion, layers), and four themes, light, dark, and the contrast theme in its light and dark forms. `npm run generate:tokens` writes `tokens/tokens.css` and `src/tokens.js`, which exports `THEMES`, `BASE`, `TYPE`, `REDUCED_MOTION`, `FONTS` and `TOKENS_CSS`; `test/tokens.test.js` fails when either is out of date, and computes every text pairing against its contrast target. The shell adopts `TOKENS_CSS`, with the names its elements used before mapped onto the semantic tokens, so `data-theme` on the root element, or the system preference, restyles it at once. The build declares the five IBM Plex faces in `strata.css` and copies them to `dist/fonts/`.
