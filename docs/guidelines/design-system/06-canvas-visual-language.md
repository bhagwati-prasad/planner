# 6. Canvas visual language

## Background

The canvas is Film (or Basalt 950 in dark theme) with a dot grid: a dot every 10 px at 100% zoom and a stronger dot every 100 px. Minor dots fade out below 50% zoom.

## Node anatomy

```
 +------------------------------------+
 | [icon]  Orders service        [2]  |   title row, open-comment badge
 |         Service, 3 instances       |   subtitle: type and key property
 +------------------------------------+
   o                                o     ports on hover, selection or connect
```

| Part | Component | Component with an inner system |
| --- | --- | --- |
| Default size | 184 x 56 px | 208 x 64 px |
| Radius, border | 6 px, 1 px control border | 6 px, 1 px control border plus stratum outlines |
| Icon | 24 px glyph on a 32 px Basalt 50 tile | Same, with a small stack glyph |
| Title | Body strong, truncated with ellipsis, full name in tooltip | Same |
| Subtitle | Small, secondary: type plus one key property | "System, 7 components" |
| Ports | 8 px circles, 24 px hit area | Boundary ports of the inner system |
| Badges | Top-right: up to three, then "+N" | Includes roll-up counts from inside |

Component icons are neutral (Basalt 700 on a Basalt 50 tile). Categories are told apart by silhouette, not colour, which keeps colour free for state.

## Node states

| State | Treatment |
| --- | --- |
| Hover | Border becomes strong; ports appear |
| Selected | 2 px accent border and a 4 px accent-subtle halo; resize handles |
| Multi-selected | Same border without handles; one bounding box with handles |
| Keyboard focus | 2 px focus ring 2 px outside the border |
| Dragging | Elevation drag, 90% opacity; the origin shows a dashed outline |
| Valid connect target | Accent ring on the target port |
| Invalid connect target | Dashed danger ring and a not-allowed cursor; tooltip says why |
| Planned | Dashed border |
| Deprecated | Dashed border, 60% content opacity, "Deprecated" chip |
| By reference (read-only) | Lock glyph in the corner; no resize handles; properties read-only |
| Missing component | Diagonal hatch fill, warning icon, "Missing: acme.message-queue 1.2.0" |
| Failing (tests or simulation) | 1.5 px danger border and error badge |
| Out of scope (during a run) | 30% opacity, no animation, not interactive in Simulate and Debug modes |
| Run-only change | A 6 px warning-coloured dot at the top right; its tooltip lists the changes |
| Context ghost (parent's neighbour) | 40% opacity, dashed, not draggable; clicking goes up a level |

## Connections

Line style encodes the kind of interaction, so the diagram reads correctly in greyscale.

| Kind | Line | Arrowhead |
| --- | --- | --- |
| Synchronous request (HTTP, gRPC unary) | Solid 1.5 px | Filled triangle |
| Streaming (gRPC streams, WebSocket) | Solid 1.5 px | Double chevron; both ends when bidirectional |
| Asynchronous message | Dashed 6/4, 1.5 px | Open triangle |
| Database protocol | Solid 1.5 px with a 4 px dot at the source | Filled triangle |
| File or batch | Dotted 2/4, 1.5 px | Open triangle |

- Default colour is Basalt 500; hover is Basalt 700; selected is accent at 2 px.
- Labels sit on a small surface-coloured pill in the middle of the connection. The connection type name appears on hover and in the inspector.
- When an edge is bound to one public method, its label shows the method name in mono, for example `publish`.
- Routing is orthogonal by default, with 8 px corner radii.

## Frames, zones and boundaries

| Element | Treatment |
| --- | --- |
| Group frame | 1 px subtle border, 6 px radius, title in title-sm at top left inside |
| Level frame | See §5; boundary ports are 12 px half-discs on the frame edge, labelled outside |
| Zone (region, availability zone) | Basalt 50 fill at 60%, 1 px subtle border, label top left |
| Trust boundary | 1.5 px dashed Basalt 600 line, lock icon and a label such as "Trust boundary: Internet to VPC" |

Trust boundaries are deliberately not red: a boundary is structure, not an error.

## Annotations

- **Note:** Paper fill, 2 px radius, no shadow unless selected, 160 x 120 px default, body text.
- **Callout:** a text box on surface with a 1 px Basalt 400 leader line ending in a 4 px dot at its target.
- **Text:** free text in body or title sizes.
- **Highlight region:** accent-subtle fill at 50% with a 1 px dashed Lapis 300 border.

## Comment pins

A 24 px circle in the author's identity colour with their initials, pointing to its anchor. A pin with more than one comment shows a count badge. Resolved threads are hidden unless the filter shows them. Pins scale inversely with zoom so they stay readable.

## Selection and manipulation

- Handles are 8 px squares with a surface fill and a 1 px accent border.
- The marquee is a 1 px accent line with an 8% accent fill.
- Smart guides are 1 px guide-coloured lines with 11 px distance labels. Snapping happens within 6 screen pixels.

## Level of detail

| Zoom | What is drawn |
| --- | --- |
| 75% and above | Everything |
| 40–75% | Subtitles and ports hidden; badges kept |
| 15–40% | Icon and title only; connection labels hidden |
| Below 15% | Blocks only; system names drawn as large labels over their areas |

## Scope and stubs

- During a scoped run, a 1.5 px dashed accent line outlines the components that run. Everything outside drops to 30% opacity.
- An edge leaving the scope ends in a stub marker: a 14 px square socket in surface colour with a control border and a plug glyph. Its tooltip names the stub mode: Fixed, Recorded or Black box.
- An edge entering the scope starts from a traffic marker: a 14 px circle with a play glyph, labelled with its source, a scenario or a recording.

## Simulation overlays

- **Utilisation:** a heat-ramp tint on the node and a 4 px bar along its bottom edge. The percentage shows at 75% zoom and above.
- **Queues:** a fill gauge showing depth against capacity.
- **Throughput:** connection width from 1.5 to 8 px on a log scale.
- **Requests:** 4 px accent dots moving along connections, capped at 400 on screen; failed requests flash danger colour.
- **Bottleneck:** a danger ring and a "Bottleneck" chip whose popover explains the cause in one sentence.

## Debug overlays

- **Paused banner** across the top of the canvas, in warning colours: "Paused at event 12,408, t = 31.204 s. Breakpoint on Orders service, message in."
- **Breakpoint:** a 10 px danger dot at the node's top left; a conditional breakpoint shows a small "?" inside the dot.
- **Current hop:** a 2 px accent outline on the component and connection being processed.
- **Followed request:** an 8 px accent dot with a 2 px halo, trailed by a 2 px accent line along the path it has taken.
- **Method stack:** while stepping inside a component, a chip under its title shows the active call chain, such as `placeOrder > reserveStock`.

---
Part of the [Strata UI/UX Design System](README.md).
