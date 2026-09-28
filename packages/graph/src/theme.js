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
  nodeStrokeStrong: '--sg-node-stroke-strong',
  nodeText: '--sg-node-text',
  nodeSubtext: '--sg-node-subtext',
  edge: '--sg-edge',
  edgeHover: '--sg-edge-hover',
  edgeLabel: '--sg-edge-label',
  edgeLabelBackground: '--sg-edge-label-background',
  port: '--sg-port',
  portActive: '--sg-port-active',
  accent: '--sg-accent',
  accentSoft: '--sg-accent-soft',
  focus: '--sg-focus',
  danger: '--sg-danger',
  warning: '--sg-warning',
  glyph: '--sg-glyph',
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
  iconTile: '--sg-icon-tile',
  iconGlyph: '--sg-icon-glyph',
  chip: '--sg-chip',
  chipText: '--sg-chip-text',
  heatLow: '--sg-heat-low',
  heatHigh: '--sg-heat-high',
  fontFamily: '--sg-font-family',
  fontFamilyMono: '--sg-font-family-mono',
  fontSize: '--sg-font-size',
  fontSizeSmall: '--sg-font-size-small',
  radius: '--sg-radius',
})

/**
 * The light theme. Canvas, nodes, ports, edges, selection, focus and status colours follow the
 * semantic tokens of design system §3; frames, zones and annotations keep theirs until 0206.
 */
export const LIGHT = Object.freeze({
  background: '#F3F5F7',
  grid: '#CFD4DC',
  gridMajor: '#B0B8C4',
  nodeFill: '#FFFFFF',
  nodeStroke: '#7F8999',
  nodeStrokeStrong: '#4F5866',
  nodeText: '#1B1F25',
  nodeSubtext: '#4F5866',
  edge: '#626C7C',
  edgeHover: '#3B424D',
  edgeLabel: '#4F5866',
  edgeLabelBackground: '#FFFFFF',
  port: '#7F8999',
  portActive: '#3346D3',
  accent: '#3346D3',
  accentSoft: '#EEF0FE',
  focus: '#3346D3',
  danger: '#B42335',
  warning: '#D99A2B',
  glyph: '#626C7C',
  frameStroke: '#a8a29e',
  frameFill: 'rgba(120, 113, 108, 0.04)',
  frameText: '#57534e',
  trustBoundary: '#dc2626',
  guide: '#7A45C2',
  sticky: '#fef3c7',
  stickyText: '#422006',
  region: 'rgba(37, 99, 235, 0.08)',
  badge: '#D0394B',
  badgeText: '#FFFFFF',
  iconTile: '#F0F2F5',
  iconGlyph: '#3B424D',
  chip: '#E4E7EC',
  chipText: '#3B424D',
  heatLow: '#16a34a',
  heatHigh: '#dc2626',
  fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontFamilyMono: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
  fontSize: '13px',
  fontSizeSmall: '12px',
  radius: '6',
})
/** The dark theme, over the light one (design system §3). */
export const DARK = Object.freeze({
  ...LIGHT,
  background: '#13161A',
  grid: '#2A3038',
  gridMajor: '#3B424D',
  nodeFill: '#1B1F25',
  nodeStroke: '#626C7C',
  nodeStrokeStrong: '#8A94A3',
  nodeText: '#E6E9EE',
  nodeSubtext: '#AEB6C2',
  edge: '#8A94A3',
  edgeHover: '#CFD4DC',
  edgeLabel: '#AEB6C2',
  edgeLabelBackground: '#1B1F25',
  port: '#626C7C',
  portActive: '#95A1F4',
  accent: '#95A1F4',
  accentSoft: '#1E2556',
  focus: '#95A1F4',
  danger: '#F0808C',
  warning: '#E7B458',
  glyph: '#8A94A3',
  frameStroke: '#78716c',
  frameFill: 'rgba(245, 245, 244, 0.03)',
  frameText: '#d6d3d1',
  trustBoundary: '#f87171',
  guide: '#B38BEB',
  sticky: '#713f12',
  stickyText: '#fef3c7',
  region: 'rgba(96, 165, 250, 0.1)',
  iconTile: '#22272E',
  iconGlyph: '#CFD4DC',
  chip: '#2A3038',
  chipText: '#CFD4DC',
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
.sg-grid-dot-minor { fill: ${v('grid')}; }
.sg-grid-dot-major { fill: ${v('gridMajor')}; }
.sg-node { cursor: default; }
.sg-node:focus { outline: none; }
.sg-node .sg-shape { fill: ${v('nodeFill')}; stroke: ${v('nodeStroke')}; stroke-width: 1; }
.sg-node .sg-label { fill: ${v('nodeText')}; font-weight: 600; text-anchor: middle; dominant-baseline: central; }
.sg-node .sg-sublabel { fill: ${v('nodeSubtext')}; font-size: ${v('fontSizeSmall')}; text-anchor: middle; dominant-baseline: central; }
.sg-node .sg-icon { color: ${v('nodeStroke')}; }
.sg-node .sg-title, .sg-node .sg-subtitle { text-anchor: start; }
.sg-icon-tile-bg { fill: ${v('iconTile')}; }
.sg-node .sg-icon-tile .sg-icon { color: ${v('iconGlyph')}; }
.sg-stack { fill: none; stroke: ${v('iconGlyph')}; stroke-width: 1.5; stroke-linecap: round; }
.sg-stratum { fill: ${v('nodeFill')}; stroke: ${v('nodeStroke')}; stroke-width: 1; }
.sg-card-badge rect { fill: ${v('chip')}; }
.sg-card-badge text, .sg-chip text { fill: ${v('chipText')}; font-size: 11px; font-weight: 500; text-anchor: middle; dominant-baseline: central; }
.sg-chip rect { fill: ${v('chip')}; stroke: ${v('nodeStroke')}; stroke-width: 1; }
/* Node states (design system §6) */
.sg-node.sg-hover .sg-shape { stroke: ${v('nodeStrokeStrong')}; }
.sg-selected .sg-shape, .sg-selected .sg-frame-rect, .sg-selected .sg-note { stroke: ${v('accent')}; stroke-width: 2; }
.sg-halo, .sg-focus-ring { fill: none; pointer-events: none; display: none; }
.sg-halo { stroke: ${v('accentSoft')}; stroke-width: 4; }
.sg-focus-ring { stroke: ${v('focus')}; stroke-width: 2; }
.sg-node.sg-selected .sg-halo, .sg-node:focus-visible .sg-focus-ring { display: inline; }
.sg-node.sg-dragging { opacity: 0.9; filter: drop-shadow(0 6px 10px rgba(19, 22, 26, 0.22)); }
.sg-drag-origin { fill: none; stroke: ${v('nodeStroke')}; stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
.sg-selection-box { fill: none; stroke: ${v('accent')}; stroke-width: 1; pointer-events: none; }
.sg-status-planned .sg-shape, .sg-status-deprecated .sg-shape, .sg-node.sg-ghost .sg-shape { stroke-dasharray: 5 3; }
.sg-status-deprecated .sg-body > :not([data-part='outline']):not(.sg-strata), .sg-status-deprecated .sg-content { opacity: 0.6; }
.sg-lock { fill: none; stroke: ${v('glyph')}; stroke-width: 1.25; stroke-linejoin: round; }
.sg-hatch-bg { fill: ${v('nodeFill')}; }
.sg-missing-hatch { stroke: ${v('nodeStroke')}; stroke-width: 1; opacity: 0.35; }
.sg-warning-glyph { fill: none; stroke: ${v('warning')}; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.sg-node.sg-failing .sg-shape { stroke: ${v('danger')}; stroke-width: 1.5; }
.sg-error-badge circle { fill: ${v('badge')}; }
.sg-error-badge text { fill: ${v('badgeText')}; font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
.sg-run-change { fill: ${v('warning')}; }
.sg-node.sg-out-of-scope { opacity: 0.3; pointer-events: none; }
.sg-node.sg-ghost { opacity: 0.4; pointer-events: none; }
.sg-node.sg-composite .sg-shape { stroke-width: 2; }
.sg-port { cursor: crosshair; }
.sg-port-hit { fill: transparent; stroke: none; }
.sg-port-dot { fill: ${v('nodeFill')}; stroke: ${v('port')}; stroke-width: 1.25; opacity: 0; }
.sg-port-ring { fill: none; stroke: ${v('accent')}; stroke-width: 2; display: none; pointer-events: none; }
.sg-port.sg-port-target .sg-port-ring, .sg-port.sg-port-invalid .sg-port-ring { display: inline; }
.sg-port.sg-port-invalid .sg-port-ring { stroke: ${v('danger')}; stroke-dasharray: 3 2; }
.sg-connect-invalid, .sg-connect-invalid * { cursor: not-allowed !important; }
.sg-refusal rect { fill: ${v('nodeFill')}; stroke: ${v('danger')}; stroke-width: 1; }
.sg-refusal text { fill: ${v('danger')}; font-size: ${v('fontSizeSmall')}; dominant-baseline: central; }
.sg-node:hover .sg-port-dot, .sg-node.sg-selected .sg-port-dot, .sg-node:focus-visible .sg-port-dot, .sg-connecting .sg-port-dot, .sg-port.sg-port-target .sg-port-dot, .sg-port.sg-port-invalid .sg-port-dot { opacity: 1; }
.sg-port:hover .sg-port-dot, .sg-port.sg-port-target .sg-port-dot { fill: ${v('portActive')}; stroke: ${v('portActive')}; }
.sg-port-candidate { stroke: ${v('portActive')}; }
.sg-edge-path { fill: none; stroke: ${v('edge')}; stroke-width: 1.5; }
.sg-token { fill: ${v('accent')}; stroke: ${v('accentSoft')}; stroke-width: 2; pointer-events: none; }
.sg-edge-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; }
.sg-edge.sg-hover .sg-edge-path { stroke: ${v('edgeHover')}; }
.sg-edge.sg-selected .sg-edge-path { stroke: ${v('accent')}; stroke-width: 2; }
/* Connection kinds (design system §6): line style carries the kind, so it reads in greyscale */
.sg-edge.sg-kind-async .sg-edge-path { stroke-dasharray: 6 4; }
.sg-edge.sg-kind-batch .sg-edge-path { stroke-dasharray: 2 4; }
.sg-edge-label-bg { fill: ${v('edgeLabelBackground')}; }
.sg-edge-label { fill: ${v('edgeLabel')}; font-size: ${v('fontSizeSmall')}; text-anchor: middle; dominant-baseline: central; }
.sg-method { font-family: ${v('fontFamilyMono')}; }
.sg-arrow, .sg-dot { fill: ${v('edge')}; }
.sg-arrow-open { fill: ${v('background')}; stroke: ${v('edge')}; stroke-width: 1.2; }
.sg-chevron { fill: none; stroke: ${v('edge')}; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
.sg-arrow.sg-marker-active, .sg-dot.sg-marker-active { fill: ${v('accent')}; }
.sg-arrow-open.sg-marker-active, .sg-chevron.sg-marker-active { stroke: ${v('accent')}; }
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
.sg-guide-label { fill: ${v('guide')}; stroke: ${v('background')}; paint-order: stroke; pointer-events: none; }
.sg-marquee { fill: ${v('accentSoft')}; fill-opacity: 0.6; stroke: ${v('accent')}; stroke-width: 1; pointer-events: none; }
.sg-ghost-edge { fill: none; stroke: ${v('accent')}; stroke-width: 1.5; stroke-dasharray: 5 4; pointer-events: none; }
.sg-handle, .sg-group-handle { fill: ${v('nodeFill')}; stroke: ${v('accent')}; stroke-width: 1.5; }
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
