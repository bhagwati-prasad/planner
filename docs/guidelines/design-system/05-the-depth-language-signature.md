# 5. The depth language (signature)

Strata's one bold visual idea is that nesting depth looks like geological strata. Three devices express it and appear nowhere else.

## Depth column

A 12 px vertical column on the left edge of the canvas shows the current path as stacked stratum bands, root at the top. The current level's band is widest and carries the system name on hover. Clicking a band jumps to that level.

```
 +--+
 |##|  Root (Basalt)
 |::|  Payments system (Sandstone)
 |==|  Settlement system (Shale)   <- current level, widest band
 +--+
```

The top-bar breadcrumb mirrors the column: each crumb has a 6 px stratum swatch before its name.

## Layered components

A component that contains an inner system shows one to three offset outlines behind it, 3 px apart to the right and below, in the stratum colour of the level inside it. One outline means one level inside; three means three or more. A child count and a drill glyph sit at the right of the title row.

```
   +-----------------------------+
  +-----------------------------+|
 +-----------------------------+||
 | [icon]  Payments system   7 >|+
 |         System, 7 components |
 +------------------------------+
```

A component without an inner system shows no outlines. Open as system (Mod+Alt+O or the context menu) gives it one, and the outlines appear as soon as the inner system exists.

## Level frame

Inside a system, a frame surrounds the canvas content with a 3 px stratum band along its top edge in the current level's colour. Boundary ports sit on the frame edge (§6).

## Drill transitions

- **Drill in:** over 420 ms, the component's bounds scale up to fill the viewport. Siblings fade out in the first 160 ms and children fade in over the last 200 ms. The new band slides into the depth column.
- **Go up:** the reverse. The system shrinks back into its node in the parent.
- **Reduced motion:** a 120 ms cross-fade, with the depth column updating instantly.

---
Part of the [Strata UI/UX Design System](README.md).
