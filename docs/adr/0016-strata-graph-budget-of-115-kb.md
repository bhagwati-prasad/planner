# 0016 strata-graph has a budget of 115 KB

Status: Accepted
Date: 2026-09-29

## Context and problem

[ADR 0014](0014-strata-graph-budget-of-110-kb.md) set eng §15's strata-graph budget at 110 KB and strata-ui's at 240 KB. That keeps core, strata-graph and strata-ui at spec §21's 600 KB total. Tasks 0207 and 0208 took strata-graph from 97.5 KB to 107.9 KB.

Task 0211 is the last task of M02. It brings the Canvas 2D node layer, used above 1,500 visible components, to the SVG layer's level:
- each shape's outline, taken from the shape's own SVG;
- the heat, breakpoint, scope and hop overlays;
- ports that connect;
- keyboard focus.

Hovered, focused and connecting components are drawn in SVG above the canvas, so they reuse the SVG layer's ports, focus ring and states instead of copying them. Even so, 0211 needs about 2.7 KB, and strata-graph reaches about 110.6 KB. The task stopped at 110.3 KB, before its last fix, to ask the human, as its notes require.

strata-ui measures 78.7 KB of its 240 KB.

## Decision drivers

- Spec §10: above about 1,500 visible elements the node layer is Canvas 2D, and the canvas must stay usable there: shapes, overlays, connecting and keyboard focus.
- Spec §21: core and UI together stay under 600 KB minified, excluding D3. Eng §15's three lines add up to that total.
- A budget CI enforces and code can meet, with room for the fixes and small features that follow M02.
- Private class member names are not shortened by the build's minifier. They make up about 6.5 KB of strata-graph (791 uses), so shortening them would save about 4 KB. That is a change to `packages/plugins`' minifier, which also packs user plugins.

## Considered options

1. **115 KB for strata-graph, and 235 KB for strata-ui.** The 600 KB total of spec §21 stays as it is.
2. **A task before 0211 finishes: the minifier shortens private class member names.** It would save about 4 KB in strata-graph and some in core, which measures 243.5 of its 250 KB, and the budgets stay as they are.
3. **Refactor strata-graph until 0211 fits in 110 KB.** It needs about 0.6 KB of savings, which are uncertain.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-29, because:

- It is the smallest change: two lines of eng §15, as in ADR 0014, and spec §21 is untouched.
- strata-ui keeps 156 KB of room above what it measures.
- 0211 is the last M02 task, so strata-graph grows more slowly after it.

## Consequences

- Good: 0211 finishes with its tests as written, and CI holds strata-graph to a limit it meets, with about 4 KB of room.
- Good: eng §15's three lines still add up to spec §21's 600 KB.
- Bad: strata-ui has 5 KB less room before M05's shell and M10's debugger.
- Neutral: option 2 stays open, as its own task, whenever a budget is tight again. It would help core too.
- Follow-up tasks: none. The change that accepted this ADR set eng §15 to 115 KB for strata-graph and 235 KB for strata-ui.

## Pros and cons of the options

### Option 1: 115 KB for strata-graph, and 235 KB for strata-ui

- Good, because spec §21's total holds, and nothing but two budget lines changes.
- Bad, because the budget moves again rather than the code shrinking.

### Option 2: the minifier shortens private class member names

- Good, because every package gets smaller, and the budgets keep their meaning.
- Bad, because it changes the minifier that also packs user plugins, and needs its own tests and review. That is more than 0211's scope.

### Option 3: refactor strata-graph until 0211 fits

- Good, because no budget or tooling changes.
- Bad, because the savings are uncertain, and it leaves no room for the next change.
