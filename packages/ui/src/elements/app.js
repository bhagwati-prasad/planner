/**
 * <strata-app>: the workspace shell (spec §9 "Workspace layout", §16 "Swappable UI").
 *
 *   Left: library and project tree · Centre: canvas · Right: inspector · Bottom: dock
 *
 * Which element fills which region comes from a JSON shell config, so replacing
 * <strata-inspector> with your own element is one line. Every region element receives the
 * strata facade and the shell through properties (`el.strata`, `el.shell`).
 *
 *   const app = document.createElement('strata-app')
 *   app.config = { ...DEFAULT_CONFIG, regions: { ...DEFAULT_CONFIG.regions, right: ['my-inspector'] } }
 *   app.strata = strata
 *   document.body.append(app)
 */
import { Shell } from './shell.js'
import { registerDefaultActions, shortcutOf, displayShortcut } from './actions.js'
import { h, fill, define, adoptStyles } from './base.js'
import { TOKENS_CSS as GENERATED_TOKENS_CSS } from '../tokens.js'

export const DEFAULT_CONFIG = Object.freeze({
  regions: {
    header: ['strata-toolbar'],
    left: ['strata-library', 'strata-tree'],
    center: ['strata-canvas'],
    right: ['strata-inspector'],
    bottom: ['strata-problems', 'strata-oplog'],
  },
  overlays: ['strata-palette', 'strata-context-menu'],
  titles: {
    'strata-library': 'Library',
    'strata-tree': 'Systems',
    'strata-problems': 'Problems',
    'strata-oplog': 'Console',
  },
})

/**
 * Design tokens (spec §16, design system §3, §15): the generated tokens, with the names the shell's
 * elements used before them mapped onto the semantic tokens, so every theme reaches them.
 */
export const TOKENS_CSS = `${GENERATED_TOKENS_CSS}
:root {
  --st-font: var(--st-type-body);
  --st-mono: 400 12px/16px var(--st-font-mono);
  --st-radius: var(--st-radius-md);
  --st-bg: var(--st-color-bg-canvas);
  --st-panel: var(--st-color-bg-surface);
  --st-field: var(--st-color-bg-raised);
  --st-line: var(--st-color-border-default);
  --st-text: var(--st-color-text-primary);
  --st-muted: var(--st-color-text-secondary);
  --st-accent: var(--st-color-accent);
  --st-accent-soft: var(--st-color-accent-subtle);
  --st-on-accent: var(--st-color-text-on-accent);
  --st-danger: var(--st-color-danger-text);
  --st-warn: var(--st-color-warning-text);
  --st-warn-soft: var(--st-color-warning-bg);
  --st-success: var(--st-color-success-text);
  --st-shadow: var(--st-elevation-1);
  --st-shadow-lg: var(--st-elevation-2);
  --st-scrim: var(--st-color-scrim);
}
`

const APP_CSS = `
:host { display: grid; height: 100%; min-height: 0; background: var(--st-bg); color: var(--st-text); font: var(--st-font);
  grid-template-columns: var(--st-left, 260px) minmax(0, 1fr) var(--st-right, 320px);
  grid-template-rows: auto minmax(0, 1fr) var(--st-bottom, 190px);
  grid-template-areas: "header header header" "left center right" "left bottom right"; }
.region { min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--st-panel); }
.header { grid-area: header; }
.left { grid-area: left; border-right: 1px solid var(--st-line); }
.center { grid-area: center; background: var(--st-bg); }
.right { grid-area: right; border-left: 1px solid var(--st-line); }
.bottom { grid-area: bottom; border-top: 1px solid var(--st-line); }
.center > *, .right > * { flex: 1; min-height: 0; }
.section { display: flex; flex-direction: column; min-height: 0; }
.left .section:first-child { flex: 3; }
.left .section + .section { flex: 2; border-top: 1px solid var(--st-line); }
.section > h1 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--st-muted); margin: 0; padding: 8px 10px 4px; font-weight: 600; }
.section > :not(h1) { flex: 1; min-height: 0; }
.tabs { display: flex; gap: 2px; padding: 0 6px; border-bottom: 1px solid var(--st-line); }
.tabs button { font: inherit; color: inherit; background: none; border: 0; border-bottom: 2px solid transparent; padding: 5px 8px; cursor: pointer; }
.tabs button[aria-selected="true"] { border-bottom-color: var(--st-accent); font-weight: 600; }
.panels { flex: 1; min-height: 0; display: flex; }
.panels > * { flex: 1; min-width: 0; }
.panels > [hidden] { display: none; }
.toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; z-index: 60; pointer-events: none; }
.toast { background: var(--st-text); color: var(--st-bg); padding: 7px 14px; border-radius: 8px; box-shadow: var(--st-shadow-lg); max-width: 70vw; }
.toast.error { background: var(--st-danger); color: #fff; }
.toast.success { background: var(--st-success); color: #fff; }
.help { position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,0.3); display: grid; place-items: center; }
.help[hidden] { display: none; }
.help > div { background: var(--st-panel); color: var(--st-text); border-radius: 10px; padding: 16px 20px; width: min(640px, 92vw); max-height: 80vh; overflow: auto; box-shadow: var(--st-shadow-lg); }
.help table { width: 100%; border-collapse: collapse; }
.help td { padding: 3px 6px; border-bottom: 1px solid var(--st-line); }
.help kbd { font: var(--st-mono); border: 1px solid var(--st-line); border-radius: 4px; padding: 0 5px; }
.help button { float: right; font: inherit; color: inherit; background: none; border: 1px solid var(--st-line); border-radius: var(--st-radius); padding: 2px 8px; cursor: pointer; }
`

/** Canvas-local shortcuts the diagram handles itself (see strata-graph). */
const GRAPH_KEYS = new Set([
  'Enter',
  'Escape',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Ctrl+A',
  '+',
  '-',
  '=',
  '0',
  ' ',
])

export class StrataApp extends HTMLElement {
  /** @type {any} */
  #strata = null
  #config = DEFAULT_CONFIG
  /** @type {Shell|null} */
  #shell = null
  #toasts
  #help
  #built = false
  #cleanup = []

  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    adoptStyles(root, APP_CSS)
    this.#toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
    this.#help = h('div', {
      class: 'help',
      hidden: true,
      onclick: e => {
        if (e.target === this.#help) this.#help.hidden = true
      },
    })
    root.append(this.#toasts, this.#help)
  }

  get strata() {
    return this.#strata
  }
  set strata(value) {
    this.#strata = value
    this.#build()
  }
  get config() {
    return this.#config
  }
  set config(value) {
    this.#config = value ?? DEFAULT_CONFIG
  }
  /** The shell, once built. */
  get shell() {
    return this.#shell
  }

  connectedCallback() {
    this.#build()
  }

  disconnectedCallback() {
    for (const fn of this.#cleanup) fn()
    this.#cleanup = []
  }

  #build() {
    if (this.#built || !this.isConnected || !this.#strata) return
    this.#built = true
    installTokens(this.ownerDocument)
    const shell = new Shell(this.#strata, { config: this.#config, root: this })
    this.#shell = shell
    registerDefaultActions(shell)
    shell.theme = initialTheme()
    applyTheme(shell.theme)

    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const regions = this.#config.regions ?? {}
    const titles = this.#config.titles ?? {}
    const make = tag => {
      const el = /** @type {any} */ (document.createElement(tag))
      el.shell = shell
      el.strata = this.#strata
      return el
    }
    for (const area of ['header', 'left', 'center', 'right', 'bottom']) {
      const tags = [].concat(regions[area] ?? [])
      const region = h('div', { class: `region ${area}`, 'data-region': area })
      if (area === 'bottom' && tags.length > 1) {
        // The dock shows one panel at a time.
        const panels = tags.map(make)
        const tabs = tags.map((tag, i) =>
          h(
            'button',
            {
              role: 'tab',
              'aria-selected': String(i === 0),
              onclick: () => {
                tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === i)))
                panels.forEach((p, j) => {
                  p.hidden = j !== i
                })
              },
            },
            titles[tag] ?? tag
          )
        )
        panels.forEach((p, i) => {
          p.hidden = i !== 0
        })
        panels[0]?.addEventListener('count', e => {
          tabs[0].textContent = `${titles[tags[0]] ?? tags[0]}${e.detail.count ? ` (${e.detail.count})` : ''}`
        })
        region.append(
          h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Dock' }, tabs),
          h('div', { class: 'panels' }, panels)
        )
      } else if (area === 'left' || tags.length > 1) {
        for (const tag of tags)
          region.append(
            h(
              'section',
              { class: 'section', 'aria-label': titles[tag] ?? tag },
              titles[tag] ? h('h1', null, titles[tag]) : null,
              make(tag)
            )
          )
      } else {
        for (const tag of tags) region.append(make(tag))
      }
      if (tags.length) root.append(region)
    }
    for (const tag of this.#config.overlays ?? []) root.append(make(tag))

    this.#cleanup.push(
      shell.on('notify', ({ message, kind }) => this.#toast(message, kind)),
      shell.on('toggle-theme', () => {
        shell.theme = shell.theme === 'dark' ? 'light' : 'dark'
        applyTheme(shell.theme)
        try {
          localStorage.setItem('strata.theme', shell.theme)
        } catch {
          /* storage unavailable */
        }
        shell.emit('theme', shell.theme)
      }),
      shell.on('help', () => this.#showHelp())
    )
    const onKey = e => this.#key(e)
    this.ownerDocument.addEventListener('keydown', onKey)
    this.#cleanup.push(() => this.ownerDocument.removeEventListener('keydown', onKey))
  }

  /** Global shortcuts. Typing in fields and keys the canvas handles itself are left alone. */
  #key(event) {
    const shell = this.#shell
    if (!shell) return
    const path = event.composedPath()
    const target = /** @type {HTMLElement} */ (path[0])
    const typing = target?.matches?.(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
    )
    const shortcut = shortcutOf(event)
    if (shortcut === 'Ctrl+K') {
      event.preventDefault()
      shell.openPalette('commands')
      return
    }
    if (typing) return
    const inCanvas = path.some(el => /** @type {any} */ (el).classList?.contains?.('sg-root'))
    if (inCanvas && GRAPH_KEYS.has(shortcut)) return
    const alternatives = { 'Ctrl+Y': 'Ctrl+Shift+Z', 'Alt+ArrowUp': 'Backspace', 'Shift+?': '?' }
    const wanted = alternatives[shortcut] ?? shortcut
    const action = shell.actions().find(a => a.shortcut === wanted)
    if (!action) return
    event.preventDefault()
    if (action.available) shell.run(action.id)
  }

  #toast(message, kind = 'info') {
    const el = h('div', { class: `toast ${kind}` }, message)
    this.#toasts.append(el)
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3000)
  }

  #showHelp() {
    const shell = /** @type {Shell} */ (this.#shell)
    const rows = shell.actions().filter(a => a.shortcut)
    const canvas = [
      ['Drag a shape', 'Move it (Alt: no snapping)'],
      ['Drag from a port', 'Connect'],
      ['Drag the background', 'Select an area (Shift adds)'],
      ['Space + drag', 'Pan'],
      ['Ctrl + wheel', 'Zoom'],
      ['Double-click / Enter', 'Enter a composite'],
      ['Delete', 'Delete the selection'],
      ['Arrows', 'Move the selection (Shift ×10)'],
      ['Tab', 'Move between shapes'],
    ]
    const close = h(
      'button',
      {
        onclick: () => {
          this.#help.hidden = true
        },
      },
      'Close'
    )
    fill(
      this.#help,
      h(
        'div',
        {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Keyboard shortcuts',
          onkeydown: e => {
            if (e.key === 'Escape') this.#help.hidden = true
          },
        },
        close,
        h('h2', null, 'Keyboard shortcuts'),
        h(
          'table',
          null,
          h(
            'tbody',
            null,
            rows.map(a =>
              h(
                'tr',
                null,
                h('td', null, h('kbd', null, displayShortcut(/** @type {string} */ (a.shortcut)))),
                h('td', null, a.title)
              )
            ),
            canvas.map(([keys, what]) =>
              h('tr', null, h('td', null, h('kbd', null, keys)), h('td', null, what))
            )
          )
        )
      )
    )
    this.#help.hidden = false
    close.focus()
  }
}

/** The design tokens, on the page itself, as a stylesheet adoptStyles shares. @param {Document} doc */
function installTokens(doc) {
  adoptStyles(doc, TOKENS_CSS)
}

function initialTheme() {
  try {
    const saved = localStorage.getItem('strata.theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

define('strata-app', StrataApp)
