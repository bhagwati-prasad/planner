/**
 * Design tokens (spec §16 "Design tokens"): every colour, size and font the graph uses is a
 * CSS custom property on the graph's root, so hosts re-theme without code.
 */

/** Token name → CSS variable. */
export const TOKENS = Object.freeze({
  background: '--sg-background',
  grid: '--sg-grid',
  gridMajor: '--sg-grid-major',
  nodeFill: '--sg-node-fill',
  nodeStroke: '--sg-node-stroke',
  nodeText: '--sg-node-text',
  nodeSubtext: '--sg-node-subtext',
  edge: '--sg-edge',
  edgeLabel: '--sg-edge-label',
  edgeLabelBackground: '--sg-edge-label-background',
  port: '--sg-port',
  portActive: '--sg-port-active',
  accent: '--sg-accent',
  accentSoft: '--sg-accent-soft',
  frameStroke: '--sg-frame-stroke',
  frameFill: '--sg-frame-fill',
  frameText: '--sg-frame-text',
  trustBoundary: '--sg-trust-boundary',
  guide: '--sg-guide',
  sticky: '--sg-sticky',
  stickyText: '--sg-sticky-text',
  region: '--sg-region',
  badge: '--sg-badge',
  badgeText: '--sg-badge-text',
  heatLow: '--sg-heat-low',
  heatHigh: '--sg-heat-high',
  fontFamily: '--sg-font-family',
  fontSize: '--sg-font-size',
  radius: '--sg-radius',
})

export const LIGHT = Object.freeze({
  background: '#fafaf9',
  grid: '#e7e5e4',
  gridMajor: '#d6d3d1',
  nodeFill: '#ffffff',
  nodeStroke: '#57534e',
  nodeText: '#1c1917',
  nodeSubtext: '#78716c',
  edge: '#57534e',
  edgeLabel: '#44403c',
  edgeLabelBackground: '#fafaf9',
  port: '#a8a29e',
  portActive: '#2563eb',
  accent: '#2563eb',
  accentSoft: 'rgba(37, 99, 235, 0.12)',
  frameStroke: '#a8a29e',
  frameFill: 'rgba(120, 113, 108, 0.04)',
  frameText: '#57534e',
  trustBoundary: '#dc2626',
  guide: '#db2777',
  sticky: '#fef3c7',
  stickyText: '#422006',
  region: 'rgba(37, 99, 235, 0.08)',
  badge: '#dc2626',
  badgeText: '#ffffff',
  heatLow: '#16a34a',
  heatHigh: '#dc2626',
  fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontSize: '12px',
  radius: '6',
})

export const DARK = Object.freeze({
  ...LIGHT,
  background: '#1c1917',
  grid: '#292524',
  gridMajor: '#3a3532',
  nodeFill: '#292524',
  nodeStroke: '#a8a29e',
  nodeText: '#f5f5f4',
  nodeSubtext: '#a8a29e',
  edge: '#a8a29e',
  edgeLabel: '#d6d3d1',
  edgeLabelBackground: '#1c1917',
  port: '#78716c',
  portActive: '#60a5fa',
  accent: '#60a5fa',
  accentSoft: 'rgba(96, 165, 250, 0.16)',
  frameStroke: '#78716c',
  frameFill: 'rgba(245, 245, 244, 0.03)',
  frameText: '#d6d3d1',
  trustBoundary: '#f87171',
  guide: '#f472b6',
  sticky: '#713f12',
  stickyText: '#fef3c7',
  region: 'rgba(96, 165, 250, 0.1)',
})

/**
 * Inline style declarations for a theme ('light', 'dark' or a partial token object over light).
 * @param {'light'|'dark'|Partial<Record<keyof typeof TOKENS, string>>} theme
 */
export function themeStyle(theme) {
  const tokens =
    theme === 'dark' ? DARK : theme === 'light' || !theme ? LIGHT : { ...LIGHT, ...theme }
  return Object.entries(TOKENS)
    .map(([key, cssVar]) => `${cssVar}: ${tokens[key]};`)
    .join(' ')
}

/** Resolved token values, for export where CSS variables are unavailable. @param {'light'|'dark'|Record<string, string>} theme */
export function themeTokens(theme) {
  return theme === 'dark'
    ? DARK
    : typeof theme === 'object' && theme
      ? { ...LIGHT, .../** @type {object} */ (theme) }
      : LIGHT
}

/** @param {keyof typeof TOKENS} token */
export const v = token => `var(${TOKENS[token]})`

/** The graph's stylesheet; lives inside the SVG so exports carry it. */
export const STYLESHEET = `
.sg-root { font-family: ${v('fontFamily')}; font-size: ${v('fontSize')}; user-select: none; -webkit-user-select: none; outline: none; touch-action: none; }
.sg-root:focus-visible { outline: 2px solid ${v('accent')}; outline-offset: -2px; }
.sg-background { fill: ${v('background')}; }
.sg-grid-minor { stroke: ${v('grid')}; }
.sg-grid-major { stroke: ${v('gridMajor')}; }
.sg-node { cursor: default; }
.sg-node:focus { outline: none; }
.sg-node .sg-shape { fill: ${v('nodeFill')}; stroke: ${v('nodeStroke')}; stroke-width: 1.25; }
.sg-node .sg-label { fill: ${v('nodeText')}; font-weight: 600; text-anchor: middle; dominant-baseline: central; }
.sg-node .sg-sublabel { fill: ${v('nodeSubtext')}; font-size: 0.85em; text-anchor: middle; dominant-baseline: central; }
.sg-node .sg-icon { color: ${v('nodeStroke')}; }
.sg-node.sg-ghost { opacity: 0.35; pointer-events: none; }
.sg-node.sg-composite .sg-shape { stroke-width: 2; }
.sg-node.sg-hover .sg-shape, .sg-node:focus-visible .sg-shape { stroke: ${v('accent')}; }
.sg-selected .sg-shape, .sg-selected .sg-frame-rect, .sg-selected .sg-note { stroke: ${v('accent')}; stroke-width: 2; }
.sg-port { fill: ${v('nodeFill')}; stroke: ${v('port')}; stroke-width: 1.25; cursor: crosshair; }
.sg-port:hover, .sg-port.sg-port-target { fill: ${v('portActive')}; stroke: ${v('portActive')}; }
.sg-port-candidate { stroke: ${v('portActive')}; }
.sg-edge-path { fill: none; stroke: ${v('edge')}; stroke-width: 1.5; }
.sg-edge-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; }
.sg-edge.sg-hover .sg-edge-path { stroke: ${v('accent')}; }
.sg-edge.sg-selected .sg-edge-path { stroke: ${v('accent')}; stroke-width: 2.25; }
.sg-edge-label-bg { fill: ${v('edgeLabelBackground')}; }
.sg-edge-label { fill: ${v('edgeLabel')}; font-size: 0.9em; text-anchor: middle; dominant-baseline: central; }
.sg-arrow { fill: ${v('edge')}; }
.sg-frame-rect { fill: ${v('frameFill')}; stroke: ${v('frameStroke')}; stroke-width: 1.25; stroke-dasharray: 6 4; pointer-events: visibleStroke; }
.sg-frame.sg-kind-trust-boundary .sg-frame-rect { stroke: ${v('trustBoundary')}; stroke-dasharray: 10 4 2 4; }
.sg-frame.sg-kind-system .sg-frame-rect { stroke-dasharray: none; stroke-width: 2; }
.sg-frame-label { fill: ${v('frameText')}; font-weight: 600; font-size: 0.95em; dominant-baseline: hanging; }
.sg-frame-title { cursor: move; fill: transparent; pointer-events: all; }
.sg-note { fill: ${v('sticky')}; stroke: rgba(0,0,0,0.08); }
.sg-annotation-text { fill: ${v('stickyText')}; dominant-baseline: hanging; }
.sg-kind-text .sg-note { fill: transparent; stroke: none; }
.sg-kind-text .sg-annotation-text, .sg-kind-shape .sg-annotation-text, .sg-kind-callout .sg-annotation-text { fill: ${v('nodeText')}; }
.sg-kind-callout .sg-note, .sg-kind-shape .sg-note { fill: ${v('nodeFill')}; stroke: ${v('nodeStroke')}; }
.sg-kind-region .sg-note { fill: ${v('region')}; stroke: none; }
.sg-kind-region .sg-annotation-text { fill: ${v('frameText')}; }
.sg-leader { fill: none; stroke: ${v('nodeStroke')}; stroke-width: 1; }
.sg-badge circle { fill: ${v('badge')}; }
.sg-badge text { fill: ${v('badgeText')}; font-size: 0.8em; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
.sg-heat { pointer-events: none; }
.sg-guide { stroke: ${v('guide')}; stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
.sg-marquee { fill: ${v('accentSoft')}; stroke: ${v('accent')}; stroke-width: 1; pointer-events: none; }
.sg-ghost-edge { fill: none; stroke: ${v('accent')}; stroke-width: 1.5; stroke-dasharray: 5 4; pointer-events: none; }
.sg-handle { fill: ${v('nodeFill')}; stroke: ${v('accent')}; stroke-width: 1.5; }
.sg-handle-nw, .sg-handle-se { cursor: nwse-resize; }
.sg-handle-ne, .sg-handle-sw { cursor: nesw-resize; }
.sg-handle-n, .sg-handle-s { cursor: ns-resize; }
.sg-handle-e, .sg-handle-w { cursor: ew-resize; }
.sg-waypoint { fill: ${v('accent')}; stroke: ${v('nodeFill')}; stroke-width: 1.5; cursor: move; }
.sg-waypoint-new { fill: ${v('nodeFill')}; stroke: ${v('accent')}; opacity: 0.8; }
.sg-locked { cursor: not-allowed; }
.sg-edge.sg-ghost { opacity: 0.35; pointer-events: none; }
.sg-dimmed { opacity: 0.2; }
.sg-readonly .sg-port { cursor: default; }
.sg-node, .sg-annotation, .sg-frame-title { cursor: move; }
.sg-readonly .sg-node, .sg-readonly .sg-annotation, .sg-readonly .sg-frame-title, .sg-node.sg-locked { cursor: default; }
.sg-panning, .sg-panning * { cursor: grabbing !important; }
`
