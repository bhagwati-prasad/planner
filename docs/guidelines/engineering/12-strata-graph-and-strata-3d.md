# 12. strata-graph and strata-3d

## strata-graph (D3)

- The library never imports Strata packages. Its whole API is data in, intents out.
- Data joins are keyed by id: `selection.data(nodes, d => d.id).join(enter, update, exit)`.
- The library owns only transient interaction state, such as a drag in progress. On drag end it emits an intent and waits for `setData`.
- Scene layers are fixed `<g>` groups in this order: grid, zones and frames, edges, nodes, overlays, annotations, comment pins, handles.
- Updates touch only elements whose `rev` changed. Hit-testing and snapping use `d3-quadtree`. The node layer switches to Canvas 2D above 1,500 visible elements.
- Styles are applied through the CSSOM (`selection.style`), never through `style` attributes.
- Text measurements are cached. Level-of-detail thresholds follow the design system.
- Transitions honour `prefers-reduced-motion`.

## strata-3d (Three.js)

- Loaded lazily, only when the 3D view opens.
- On teardown, dispose every geometry, material, texture and the renderer.
- Cap the device pixel ratio at 2. Pause the render loop when the tab is hidden or the view is inactive.
- Use instanced meshes for more than 100 similar objects.

---
Part of the [Strata Engineering Guidelines](README.md).
