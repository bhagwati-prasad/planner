# 13. Iconography

- **Interface icons:** 16 px on a 16 px grid, 1.5 px stroke, round caps and joins, 1 px padding. A 20 px variant is used in the top bar.
- **Component icons:** 24 px glyphs on a 24 px grid in the same stroke style, drawn on a 32 px tile. Each category has a distinct silhouette.
- **Delivery:** an in-house SVG sprite inlined into the HTML, used with `<strata-icon name="queue">`. External sprite files are avoided because `file://` pages cannot always reference them.
- **Custom component icons** must use a `0 0 24 24` viewBox, vector paths only, no scripts or raster images, and stay under 4 KB. `strata validate` checks this.

---
Part of the [Strata UI/UX Design System](README.md).
