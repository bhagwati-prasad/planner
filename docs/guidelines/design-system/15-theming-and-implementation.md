# 15. Theming and implementation

- Tokens are defined once in `packages/ui/tokens/tokens.json`. The build generates `tokens.css` for CSS and `tokens.js` for canvas and Three.js code, which cannot read CSS variables directly.
- Themes are selected with `data-theme` on the root element: `light`, `dark` or `contrast`. When no theme is chosen, the system preference applies.
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
