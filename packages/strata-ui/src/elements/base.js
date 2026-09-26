/**
 * Base class and helpers for the shell's Web Components. Elements receive the strata facade
 * and the shell through properties (`element.strata`, `element.shell`) set by <strata-app>,
 * so any element can be swapped for another that follows the same contract (spec §16).
 *
 * DOM is built with `h()`: text always goes through textContent, never innerHTML, so names
 * and descriptions typed by users cannot inject markup.
 */

/**
 * Creates an element. Attributes starting with `on` become listeners; `class`, `style`
 * strings and other attributes are set as given; children may be strings, nodes, arrays or
 * null.
 * @param {string} tag
 * @param {Record<string, any>|null} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h (tag, attrs, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'dataset') Object.assign(el.dataset, value)
    else if (key === 'value' && 'value' in el) /** @type {any} */ (el).value = value
    else if (key === 'checked' && 'checked' in el) /** @type {any} */ (el).checked = !!value
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  append(el, children)
  return el
}

/**
 * Replaces an element's children, skipping null, undefined and false and flattening arrays
 * (unlike replaceChildren, which would print "null").
 * @param {Element} el
 * @param {...any} children
 */
export function fill (el, ...children) {
  el.replaceChildren()
  append(el, children)
  return el
}

function append (el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (Array.isArray(child)) append(el, child)
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

/** Styles every shell element shares; tokens come from the page (see app.js). */
export const BASE_CSS = `
:host { display: block; box-sizing: border-box; color: var(--st-text); font: var(--st-font); }
*, *::before, *::after { box-sizing: inherit; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: transparent; border: 1px solid var(--st-line); border-radius: var(--st-radius); padding: 3px 8px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--st-accent); }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 1px; }
button:disabled { opacity: 0.45; cursor: default; }
button.primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-on-accent); }
button.ghost { border-color: transparent; }
input, select, textarea { background: var(--st-field); border: 1px solid var(--st-line); border-radius: var(--st-radius); padding: 3px 6px; min-width: 0; }
textarea { resize: vertical; }
h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--st-muted); margin: 12px 0 6px; font-weight: 600; }
.muted { color: var(--st-muted); }
.row { display: flex; gap: 6px; align-items: center; }
.grow { flex: 1; min-width: 0; }
.error { color: var(--st-danger); }
.empty { color: var(--st-muted); padding: 12px; text-align: center; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`

export class StrataElement extends HTMLElement {
  /** @type {import('../../../strata/src/index.js').Strata|null} */
  #strata = null
  /** @type {import('./shell.js').Shell|null} */
  #shell = null
  /** @type {(() => void)[]} */
  #subscriptions = []
  #scheduled = false

  /** Element-specific CSS, added after BASE_CSS. */
  static css = ''

  constructor () {
    super()
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = BASE_CSS + /** @type {typeof StrataElement} */ (this.constructor).css
    root.append(style)
    this.content = document.createElement('div')
    this.content.className = 'content'
    root.append(this.content)
  }

  get strata () { return this.#strata }
  set strata (value) {
    this.#strata = value
    this.#connect()
  }

  get shell () { return this.#shell }
  set shell (value) {
    this.#shell = value
    this.#connect()
  }

  connectedCallback () { this.#connect() }

  disconnectedCallback () {
    for (const off of this.#subscriptions) off()
    this.#subscriptions = []
  }

  #connect () {
    if (!this.isConnected || !this.#strata || !this.#shell || this.#subscriptions.length) return
    this.#subscriptions = this.subscribe(this.#strata, this.#shell) ?? []
    this.update()
  }

  /**
   * Subscribes to the events the element needs; returns unsubscribe functions.
   * @param {import('../../../strata/src/index.js').Strata} strata
   * @param {import('./shell.js').Shell} shell
   * @returns {(() => void)[]}
   */
  subscribe (strata, shell) { return [] }

  /** Re-renders on the next frame (coalesces bursts of events). */
  invalidate () {
    if (this.#scheduled) return
    this.#scheduled = true
    requestAnimationFrame(() => {
      this.#scheduled = false
      if (this.isConnected) this.update()
    })
  }

  /** Renders the element; override. */
  update () {}

  /**
   * Runs a model change and reports failures to the user instead of throwing.
   * @param {() => void} fn
   */
  attempt (fn) {
    try {
      fn()
      return true
    } catch (err) {
      this.#shell?.notify(/** @type {Error} */ (err).message, 'error')
      return false
    }
  }
}

/**
 * Defines a custom element once (defining twice throws).
 * @param {string} name
 * @param {CustomElementConstructor} ctor
 */
export function define (name, ctor) {
  if (!customElements.get(name)) customElements.define(name, ctor)
}
