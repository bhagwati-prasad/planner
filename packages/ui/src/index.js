/**
 * strata-ui: the Strata shell (spec §9, §16). The view adapter maps the model to strata-graph
 * data and intents back to commands; the Web Components under elements/ build the workspace.
 */
export {
  toGraphData,
  applyIntent,
  parseId,
  ids,
  shapeFor,
  shapeSize,
  SHAPE_BY_BASE,
  SIDE_BY_DIRECTION,
} from './adapter.js'
// The design tokens by theme, for canvas and 3D code (design system §15).
export { THEMES, BASE, TYPE, REDUCED_MOTION, FONTS } from './tokens.js'
