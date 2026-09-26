# 2. Design direction

Strata's visual world is the stratigraphic column and the survey drawing: pale drafting film, basalt ink, mineral accents and sediment bands. The people using it are software architects and engineers doing long, focused sessions on dense technical diagrams, so the interface is precise and low-glare rather than decorative.

## Core palette

| Name | Hex | Role |
| --- | --- | --- |
| Film | `#F3F5F7` | Light canvas, the drafting surface |
| Basalt | `#1B1F25` | Ink: primary text in light theme, surfaces in dark theme |
| Lapis | `#3346D3` | The one accent: selection, focus, primary actions |
| Sandstone | `#C39A6B` | First stratum band; depth only, never state |
| Garnet | `#B42335` | Errors, failures, breakpoints |
| Malachite | `#197A50` | Success and passing tests |

## Typography

IBM Plex Sans for all interface and document text, and IBM Plex Mono for code, expressions, identifiers and paths. Plex comes from an engineering-drawing tradition, has true tabular figures and stays legible at 11–13 px. Both are OFL-licensed and bundled as Latin-subset woff2, so the offline app needs no network.

## Why these choices

The direction was checked against common generated-interface defaults and revised where it drifted toward them. Surfaces are cool drafting film, not warm cream. The accent is a mineral blue that doubles as the selection colour, rather than a decorative orange or acid green. Panels are docked and flush with hairline dividers instead of floating cards. Corner radius changes with hierarchy instead of being one value everywhere. The one bold element is the depth language of stratum bands, layered components and the depth column; everything around it stays disciplined.

---
Part of the [Strata UI/UX Design System](README.md).
