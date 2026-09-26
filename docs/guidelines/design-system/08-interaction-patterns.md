# 8. Interaction patterns

## Selection

- Click selects; Shift+click adds; Mod+click toggles; dragging on empty canvas draws a marquee.
- Space+drag, or the middle mouse button, pans. Pinch and Mod+scroll zoom around the pointer.
- Double-click a component with an inner system to drill in; double-click any other component to rename it.
- Right-click opens a context menu for the selection.

## Modes

- Design edits the model. Simulate runs and shows overlays. Debug adds breakpoints and stepping. Test shows suites and results. Docs and Plan show their workspaces beside a smaller canvas.
- While a run is playing, structure is locked, and a notice explains this if someone tries to drag. While paused, everything can be edited; see Editing a paused run.

## Changes, undo and confirmation

- Prefer undo to confirmation. Nearly everything can be undone, so most actions happen immediately and show a toast with Undo.
- Confirm only when an action reaches beyond the current view: deleting a node that appears in other views, deleting a project, or inlining a system used by reference elsewhere. The dialog names what else is affected.

## Saving and status

- The top bar shows save state in plain words: "Saved locally", "Saving", or "Not saved: storage full". Timestamps appear in the tooltip.
- An "Offline" or "Served" indicator shows how the app was loaded, since some features depend on it.

## Recursion actions

- **Extract as system** (Mod+Alt+G) opens a preview. The new System component appears with its proposed boundary ports named from the crossing connections, and each name is editable before confirming.
- **Inline system** (Mod+Alt+Shift+G) previews where the inner nodes will land and warns if the system is also used by reference elsewhere.
- **Open as system** (Mod+Alt+O) gives any component an inner system, with its boundary ports placed and its public methods listed as unbound, ready to wire.
- **Enter** drills into the focused component's inner system; **Escape** with nothing selected goes up one level.

## Choosing a scope

- The scope chip in the run control bar offers Whole project, This system, Selection and Request path. Selection uses the current canvas selection.
- Before a scoped run starts, a preview lists the edges that will be stubbed and the traffic sources, and each stub's mode can be changed inline.
- Scopes are saved with the scenario and appear in the run's title in the Runs panel.

## Editing a paused run

- Any change made while paused is run-only and adds to the change chip in the control bar. The chip's list offers Keep in model and Discard, per change or for all.
- Play becomes the continuation split button (§7). Its default is the least disruptive option available: Resume with changes, then Replay from here, then Restart with changes.
- When a run ends with run-only changes, a toast asks "Keep 3 changes in the model?" with Keep and Discard.

## Commenting

Press C, or use the context menu, to comment on the selection. With nothing selected, a comment attaches to the current system. On empty canvas it drops a pin where you clicked. New threads open in the inspector's Comments tab with the text field focused.

## Onboarding and empty states

A new project offers three starts: from a pattern, from a `.strata` or draw.io file, or blank. Empty panels say what the panel is for and offer one action, for example: "No scenarios yet. Scenarios send sample requests through this system so you can measure it." with the button "Create scenario".

---
Part of the [Strata UI/UX Design System](README.md).
