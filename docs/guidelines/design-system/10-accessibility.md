# 10. Accessibility

Strata targets WCAG 2.2 AA across the app, including the canvas.

## Canvas

- The canvas is a focusable region with `role="application"` and `aria-roledescription="architecture diagram"`.
- Tab moves between regions. Inside the canvas, arrow keys move focus to the nearest node in that direction, and E cycles through the focused node's connections.
- A polite live region announces focus: "Orders service, service, 2 inputs, 3 outputs, 1 open comment, utilisation 82%."
- **Outline view** (Mod+Shift+O) is the full accessible equivalent of the diagram: a tree of systems, nodes and connections supporting the same actions, including drill-in, rename, comment and delete.

## Everywhere

- Focus is always visible: a 2 px focus-token ring with a 2 px offset, never removed.
- Pointer targets are at least 24 x 24 px, including ports and handles, whose hit areas exceed their drawn size.
- Status, heat and connection kinds never rely on colour alone; icons, line styles and text carry the same meaning.
- The interface works at 200% browser zoom and with text spacing overrides.
- `forced-colors` mode maps borders, focus and selection to system colours.
- A high-contrast theme raises text to 7:1 and borders to 2 px.
- Every panel has a heading, landmark roles and a logical tab order. Dialogs trap focus and return it on close.
- Run state changes (playing, paused, stopped, finished, breakpoint hit) are announced. The scrubber is a slider whose value text gives the simulated time and event number.

---
Part of the [Strata UI/UX Design System](README.md).
