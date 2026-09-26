/**
 * strata-graph: a small D3 diagramming library (spec §9). It renders nodes, ports, edges,
 * frames and annotations, captures gestures and emits intents; it never owns state and knows
 * nothing about Strata. The headless modules exported here also work in Node.
 */
export * from './geometry.js'
export { routeEdge, routeOrthogonal, orthogonalThrough, polylinePath, pointAlong, simplify, ROUTINGS } from './routing.js'
export { SpatialIndex } from './spatial.js'
export { smartGuides, snapMove, snapRect } from './snap.js'
export { align, distribute, ALIGN_MODES } from './arrange.js'
export { fitTransform, zoomAt, screenToWorld, worldToScreen, visibleRect, IDENTITY } from './viewport.js'
export { wrapText, estimateMeasure } from './text.js'
export { GraphModel, DEFAULT_NODE_SIZE, FRAME_KINDS, ANNOTATION_KINDS } from './data.js'
export { TOKENS, LIGHT, DARK, themeStyle, themeTokens } from './theme.js'
