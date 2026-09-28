# 0015 strata-graph uses its own spatial index

Status: Accepted
Date: 2026-09-28

## Context and problem

Spec §10 says strata-graph uses "`d3-quadtree` for hit-testing and snapping". Eng §12 repeats it: "Hit-testing and snapping use `d3-quadtree`." Since M02's first stage, strata-graph has instead had its own uniform-grid index, `SpatialIndex` in `packages/graph/src/spatial.js`. It indexes rectangles, not points, in cells of 256 world units. Five callers in the renderer query it: marquee selection, viewport culling, smart-guide neighbours, connect targets, and the frame under a dropped item. Task 0207 asks for "quadtree hit-testing" and exact hit-testing with 2,000 components, so the code and the text had to agree.

## Decision drivers

- Exact hit-testing and snapping at 2,000 components and beyond, within the frame budget of eng §15.
- The headless modules of strata-graph (geometry, routing, snapping, the spatial index) run and are tested in Node without D3, as spec §18 and eng §12's "data in, intents out" require.
- One index, not two to keep in step, for every spatial question the renderer asks.
- The text of the spec and the guidelines describes what the code does.

## Considered options

1. **Keep the grid index, and amend spec §10 and eng §12 to say "a spatial index".**
2. **Replace the grid with an in-house quadtree** behind the same API, still Node-testable without D3.
3. **Use the vendored `d3.quadtree` in the renderer for pointer hit-testing**, and keep the grid for everything else.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-28, because:

- The grid already answers rectangle queries exactly: it tests each candidate's rectangle, not its centre.
- It runs in Node without D3, has its own tests in `packages/graph/test/geometry.test.js`, and serves every caller from one structure.
- A quadtree would change the structure without changing the answers.
- `d3.quadtree` indexes points, so rectangle hit-testing on it needs a centre search, a radius and an exact test anyway. It would also add a second index for the same items.

## Consequences

- Good: no rewrite. Hit-testing in 0207's Canvas layer queries the same index as the rest of the renderer.
- Good: the spec and the guidelines describe the code again.
- Bad: a uniform grid degrades when many large rectangles share cells, for example deeply nested frames that each span the canvas. 0207's 2,000-component test and pan benchmark measure the common case. A layout that defeats the grid would need a new measure first.
- Follow-up tasks: none. Spec §10 and eng §12 now say "a spatial index", with a link to this ADR.

## Pros and cons of the options

### Option 1: keep the grid index, and amend the wording

- Good, because the code, its tests and its callers stay as they are.
- Good, because rectangle queries are exact and need no D3.
- Bad, because a grid's cell size is a tuning choice that a quadtree would not need.

### Option 2: an in-house quadtree

- Good, because it adapts to uneven density without a cell size.
- Bad, because it rewrites a tested module for the same answers, and it is not `d3-quadtree` either, so the text would still need changing.

### Option 3: `d3.quadtree` in the renderer

- Good, because it matches the current wording.
- Bad, because it adds a second index to keep in step with the first, and it indexes points, so rectangles need extra work.
- Bad, because the headless modules could not use it without D3.
