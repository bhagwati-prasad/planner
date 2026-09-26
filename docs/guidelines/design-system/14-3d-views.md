# 14. 3D views

- **Stack view:** one plane per depth level, 120 units apart, filled with its stratum colour at 12% opacity and edged at 40%. Nodes are flat rounded tiles raised 4 units, in surface colour with control borders. Components with an inner system connect to its plane with thin vertical lines in its stratum colour.
- **Isometric deployment view:** zones as low plinths, nodes as tiles, connections as lines that become thin tubes when selected.
- **Lighting and camera:** ambient light plus one directional light, no shadows. The default camera is isometric at 35 degrees and orbits on drag.
- **Labels** are canvas-text sprites in the same type tokens. The background uses the canvas token.
- **Simulation particles** reuse the 2D request-dot rules, including the 400-dot cap and the reduced-motion fallback.

---
Part of the [Strata UI/UX Design System](README.md).
