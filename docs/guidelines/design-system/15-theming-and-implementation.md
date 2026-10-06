# 15. Theming and implementation

- Tokens are defined once in `packages/ui/tokens/tokens.json`. `npm run generate:tokens` (`tools/tokens/generate.js`) writes `packages/ui/tokens/tokens.css` for CSS and `packages/ui/src/tokens.js` for canvas and Three.js code, which cannot read CSS variables directly; a test fails when either is out of date. `tokens.js` also carries the CSS, which the shell adopts as a constructed stylesheet, since the CSP allows no inline styles.
- Themes are selected with `data-theme` on the root element: `light`, `dark` or `contrast`. When no theme is chosen, the system preference applies. The contrast theme follows the system preference too, in its light or dark form.
- The offline app's `strata.css` declares the bundled IBM Plex faces, which the build copies to `dist/fonts/`.
- Canvas and 3D renderers re-read `tokens.js` values when the theme changes.
- Components expose `part` attributes, so a replacement theme can restyle internals without forking components.

```css
:root {
  --st-color-bg-canvas: #F3F5F7;
  --st-color-bg-surface: #FFFFFF;
  --st-color-text-primary: #1B1F25;
  --st-color-accent: #3346D3;
  --st-radius-md: 6px;
  --st-duration-base: 160ms;
}

:root[data-theme="dark"] {
  --st-color-bg-canvas: #13161A;
  --st-color-bg-surface: #1B1F25;
  --st-color-text-primary: #E6E9EE;
  --st-color-accent: #95A1F4;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --st-color-bg-canvas: #13161A;
    --st-color-bg-surface: #1B1F25;
    --st-color-text-primary: #E6E9EE;
    --st-color-accent: #95A1F4;
  }
}

@media (prefers-reduced-motion: reduce) {
  :root { --st-duration-depth: 120ms; }
}
```

- **Sketch mode (R2)** changes only rendering: node and connection strokes get a seeded path jitter. Fonts, colours and layout stay the same.

---
Part of the [Strata UI/UX Design System](README.md).
