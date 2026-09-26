# 7. Components

Every component is a `strata-*` custom element styled only with tokens. The table covers the general kit; domain-specific components follow in more detail.

## General components

| Element | Variants and sizes | Key rules |
| --- | --- | --- |
| `strata-button` | Primary (accent fill), secondary (surface, control border), ghost, danger; 24, 28 or 32 px high | Label is a verb ("Run scenario"); icon-only buttons need an accessible label and a tooltip; danger only for irreversible actions |
| `strata-icon-button` | Ghost or secondary; square | Active toggles show accent-subtle background |
| `strata-input` | Text, number, search | 28 px; unit suffix inside on the right in tertiary text; invalid state shows danger border and message below |
| `strata-select`, `strata-combobox` | Single, multiple, searchable | Keyboard type-ahead; options show icon and secondary text where useful |
| `strata-checkbox`, `strata-switch` | Standard | Switch applies immediately; checkbox needs a Save or Apply |
| `strata-segmented` | 2–5 options | For modes and views, such as Logical, Deployment, Data flow |
| `strata-slider` | Continuous or stepped | Paired with an input for exact values |
| `strata-tabs` | Underline | 2 px accent underline on the active tab; no pill tabs |
| `strata-tree` | Project tree, outline view | Arrow-key navigation, type-ahead, stratum swatch per system |
| `strata-table` | Standard, compact | 32 or 28 px rows; sticky header; right-aligned tabular numbers; virtualised over 200 rows; no zebra stripes |
| `strata-badge`, `strata-chip`, `strata-tag` | Count, status, tag | Count badges are 16 px pills; status chips always include an icon |
| `strata-tooltip` | Standard | Inverted colours, 12 px text, 280 px max, 500 ms delay on hover and none on keyboard focus; shows the shortcut |
| `strata-menu` | Context, dropdown | 28 px items with icon, label and shortcut; destructive items last, separated |
| `strata-popover` | Anchored | Elevation 1, lg radius; closes on Escape and outside click |
| `strata-dialog` | 480, 640, 800 px | Title, body, right-aligned footer with the primary action rightmost; Escape closes unless there are unsaved changes |
| `strata-toast` | Info, success, warning, error | Bottom right, 360 px, three at most; closes after 5 s except errors; includes Undo after destructive actions |
| `strata-empty` | Panel, canvas, full page | Title, one sentence, one primary action |
| `strata-skeleton`, `strata-progress` | Inline, bar | Skeletons for content over 300 ms; progress bars for runs and exports |
| `strata-avatar` | 20, 24, 32 px | Identity colour and initials; presence ring in R4 |

## Property grid (`strata-property-grid`)

The inspector's main surface, and the most-used component after the canvas.

- Two columns: label (40%) and value (60%). Rows are 28 px, or 24 px in compact density. Groups from the manifest collapse, with title-sm headings.
- A 12 px gutter left of each value shows its source:

| Marker | Meaning | Interaction |
| --- | --- | --- |
| None | Default value | Editable |
| Accent dot | Overridden | Click the dot to reset to the default |
| Warning dot | Changed for this run only | Row menu offers Keep in model or Discard |
| Sigma glyph | Rolled up from inside a system | Read-only; tooltip names the rule, such as "Critical path through 7 components" |
| Link glyph | Comes from a referenced system | Read-only; "Open source system" action |

- Hovering a row reveals Reset and Comment actions. Commenting on a row anchors the thread to that property.
- When several nodes are selected, differing values show "Mixed" and editing sets them all.
- Validation messages appear under the row in danger colours and never in a dialog.

## Unit input (`strata-unit-input`)

Numbers are always entered with a unit. The unit sits inside the field and becomes a dropdown when alternatives exist (ms, s, min). Typing `2s` into a millisecond field converts it to 2,000 ms. The stored value is always canonical (Engineering Guidelines §8).

## Distribution input (`strata-distribution-input`)

- **Collapsed:** a sentence plus a 64 x 16 px curve, for example "Lognormal, median 5 ms, p99 40 ms".
- **Expanded (popover):** a kind selector, parameter fields with units, and a 240 x 80 px density plot with p50, p95 and p99 markers.
- **Constant values** collapse to a plain unit input.

## Metric tile (`strata-metric`)

A value in 20/28 px semibold tabular figures, its unit in small secondary text, a label, and a 120 x 24 px sparkline. The delta against a baseline run takes status colour only when it crosses an SLO.

## Trace waterfall (`strata-trace`)

- Rows are 24 px; span bars are 12 px high with 2 px radius.
- Bar colour: Basalt 400 for normal, warning for slower than the SLO, danger for errors.
- Indentation is 12 px per nesting level. A stratum tick marks where the trace enters a component's inner system.
- Hovering a span highlights its node and connection on the canvas; clicking selects them.
- The time axis picks µs, ms or s automatically.

## Comment thread (`strata-thread`)

- Header: avatar, author name, relative time (absolute on hover), and type chip.
- Body: sanitised Markdown with mentions and entity links.
- Actions: Reply, Resolve, and a Convert menu (to ADR, ticket, risk or test).
- A "Changed since this comment" info callout lists what changed; old values are struck through in tertiary text and new values are in primary text.

## Ticket card (`strata-ticket-card`)

A 272 px card with a 6 px radius. It shows the key in mono, a title of up to two lines, then type, priority, points, link count and assignee. The left edge carries a 3 px stratum band for the system the ticket belongs to.

## Command palette (`strata-command-palette`)

Opens with Mod+K. It is 640 px wide and placed 20% from the top, with a 16 px input. Result rows are 36 px, with an icon, a label and the shortcut on the right. Results are grouped into Actions, Components, Systems, Docs and Tickets. Matched characters are shown in semibold rather than in colour.

## Run control bar (`strata-run-controls`)

A 40 px bar across the top of the canvas, visible in every mode. From left to right:

| Group | Controls |
| --- | --- |
| Run | Play/Pause toggle, Stop, Restart, Run to end |
| Step | Step back, count field (default 1), step unit menu (Event, Hop, Followed hop, Method call, Time), Step forward, Step into, Step out |
| Speed | Segmented control: 0.1×, 1×, 10×, Max |
| Scope | Chip showing the current scope, such as "Selection, 4 components"; click to change |
| Status | Run state and simulated time, such as "Paused at t = 31.204 s" |

- Controls are 28 px icon buttons whose tooltips include their shortcuts. Play is the only filled (primary) button.
- Disabled controls stay visible and give the reason in their tooltip, for example "Step back needs a paused run".
- When a paused run has changes, Play becomes a split button labelled "Resume with changes", with "Replay from here" and "Restart with changes" in its menu. Options that don't suit the kind of change are disabled with a reason.
- A "3 run-only changes" chip appears beside the status; it opens the change list.

## Scrubber (`strata-scrubber`)

Sits above the dock in Simulate and Debug modes and spans the run's simulated time.

- The playhead is a 2 px accent line with a 12 px draggable handle.
- Markers: breakpoint hits as danger ticks, fault windows as warning bands, errors as danger dots, edits as warning diamonds, and branch points as accent diamonds.
- Arrow keys move one step unit; Shift+Arrow moves ten. Hovering shows the simulated time and event number.

## Runs panel (`strata-run-tree`)

A dock tab listing runs as a tree. Branches are indented under the run they came from, labelled with their branch time and a summary of their changes. Selecting two runs opens a side-by-side comparison of metrics, traces and state at the same moment.

## State editor (`strata-state-editor`)

The inspector's State tab. Scalar fields render as property-grid rows. Queues, lists, maps and tables open as virtualised tables with row counts. It is read-only while a run plays and editable while paused, marking each change as run-only. In Design mode it edits initial state.

## Method list (`strata-method-list`)

The inspector's Methods tab. Public methods come first, then private methods marked with a lock glyph. Each row shows the signature in mono, the call count and p95 latency for the current run, and actions:

- **Call** (public methods only): sends a one-off request, scoped to this component, into a paused run or a new run.
- **Set breakpoint** on the method.
- **Go to code.**

For a component with an inner system, each public method also shows which inner component's method it is bound to, or "Unbound" in warning colours.

---
Part of the [Strata UI/UX Design System](README.md).
