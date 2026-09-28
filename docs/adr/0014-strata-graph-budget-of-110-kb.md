# 0014 strata-graph has a budget of 110 KB

Status: Accepted
Date: 2026-09-28

## Context and problem

Eng §15 budgets "strata-graph (minified)" at 60 KB, with D3 excluded. The library already measured 75.8 KB when M02 began. Tasks 0201 to 0206 then took it to 97.5 KB, bringing it to the scene, shapes, edges, node states, interaction, guides, frames and annotations of design system §5, §6 and §8. Each task raised its recorded exception in `tools/ci/size-exceptions.json`, under the human's policy, and 0207 owns bringing it back within budget. 0207 itself adds level of detail and a Canvas 2D node layer above 1,500 elements (spec §10, eng §12), and 0208 adds overlays and export. Spec §21 caps core and UI together at 600 KB minified, excluding D3. That is exactly the sum of eng §15's three lines: 250 KB for core, 60 KB for strata-graph and 290 KB for strata-ui.

Where the 97.5 KB goes:

| File | KB |
| --- | --- |
| `dom/graph.js`: scene, gestures, intents, handles, rendering | 52.0 |
| `theme.js`: stylesheet and the two themes' tokens | 13.7 |
| `routing.js`: orthogonal, straight and curved routes | 6.9 |
| `dom/shapes.js`: built-in shapes and the card | 6.2 |
| `data.js`: graph model and validation | 4.5 |
| The other nine modules | 14.2 |

Shortening every private name to one character would save about 4.3 KB. No other change that keeps the features in sight comes near the 37.5 KB that 60 KB would require.

## Decision drivers

- Spec §10 and its R0 canvas features: ports, routing, frames, annotations, snapping, the minimap, themes, and the Canvas 2D layer above 1,500 elements. Design system §5, §6 and §8 give every visual state and interaction.
- Spec §21: the offline app is interactive in under 2 s, and core plus UI stay under 600 KB minified, excluding D3. Eng §15 enforces that total through its three lines.
- A budget that CI enforces and that code can meet, instead of an exception that only grows (eng §15: CI fails on a regression of more than 10% or a crossed budget).
- No runtime dependencies besides D3 and Three.js (eng §2), so the size cannot move into a library.

## Considered options

1. **110 KB for strata-graph, and 240 KB for strata-ui.** The 600 KB total of spec §21 stays as it is.
2. **110 KB for strata-graph, and 650 KB in spec §21.** strata-ui keeps 290 KB.
3. **Keep 60 KB, and give the exception a shrink task.** 0207 and 0208 keep raising the recorded size. A new task after 0208 owns getting back to 60 KB.
4. **Cut strata-graph to 60 KB in 0207.** Remove or move features until it fits.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-28, because:

- It keeps spec §21's startup budget whole, with no spec change.
- strata-ui measures 78.7 KB of its 290 KB, so 240 KB still leaves it room for the shell, inspector and run controls that R0 adds, and for later panels.

Options 3 and 4 were not chosen. Option 3 leaves a budget that nothing is expected to meet. Option 4 removes R0 features the spec asks for.

## Consequences

- Good: CI holds strata-graph to a limit it can meet, and the 10% regression rule applies to it again.
- Good: 0207 no longer owns a shrink it cannot deliver. The strata-graph line in `size-exceptions.json` is removed, because the check fails while an exception is no longer needed.
- Bad: 110 KB leaves about 12 KB above today's 97.5 KB, and 0207 and 0208 are expected to use most of it. R1's auto-layout (layered, force and tree, spec §10) will need its own module outside this measure, or another ADR.
- Bad: strata-ui has 50 KB less room, and eng §15 changes in two lines.
- Follow-up tasks: none. The change that accepted this ADR set eng §15 to 110 KB for strata-graph and 240 KB for strata-ui. It also removed the strata-graph exception, and `tools/ci/README.md` no longer names 0207 as the owner of a shrink.

## Pros and cons of the options

### Option 1: 110 KB for strata-graph, and 240 KB for strata-ui

- Good, because spec §21's 600 KB total holds, and eng §15's lines still sum to it.
- Good, because both packages get budgets they can meet: strata-graph ships 97.5 KB, strata-ui 78.7 KB.
- Bad, because it moves 50 KB away from strata-ui before its largest milestones are built: the M05 shell in R0, and the M10 debugger after it.

### Option 2: 110 KB for strata-graph, and 650 KB in spec §21

- Good, because strata-ui keeps all of its 290 KB.
- Bad, because it changes the product specification's startup budget, which spec §21 ties to being interactive in under 2 s.
- Bad, because every later growth could argue the same way, and the total stops being a limit.

### Option 3: keep 60 KB, and give the exception a shrink task

- Good, because no guideline or spec changes.
- Bad, because nothing known reaches 60 KB. Private names save about 4.3 KB, and the stylesheet, routing and shapes are features, not waste.
- Bad, because an exception that only grows gives CI no limit to enforce.

### Option 4: cut strata-graph to 60 KB in 0207

- Good, because it meets the current budget.
- Bad, because it means dropping R0 features that spec §10 lists, such as curved routing, the minimap, annotations or node states, or moving them into strata-ui. That breaks spec §4's rule that strata-graph is the generic diagram library, and eng §12's layering.
