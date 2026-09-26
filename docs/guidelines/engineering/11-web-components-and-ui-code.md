# 11. Web Components and UI code

UI code is thin: it renders facade data and turns user actions into facade calls.

## Elements

- One custom element per file; the file name matches the element name.
- Every element extends `StrataElement`, which provides an open shadow root, template cloning, adopted token stylesheets and subscriptions that clean up automatically.
- Registration is guarded (`if (!customElements.get(name))`) so two bundles never clash.
- New panels are registered in the shell config (`shell.json`), not hard-coded into the layout.

## Templates and rendering

- Templates live in a sibling `.html` file that the bundler inlines, or are built with `document.createElement('template')`.
- Dynamic values go through `textContent` and `setAttribute`. `innerHTML` is allowed only for static templates and sanitised rich text. **(lint)**
- DOM writes are batched in `requestAnimationFrame`, with reads before writes to avoid layout thrashing.
- Lists longer than 200 rows are virtualised.

## Styling

- Component CSS uses semantic tokens only (`var(--st-…)`). Hex, rgb and named colours are rejected. **(lint)**
- Styles are constructable stylesheets adopted into the shadow root, never `<style>` tags or `style` attributes, so the served CSP needs no `unsafe-inline`.
- Themable internals are exposed with `part` attributes.

## Data and events

- Attributes hold primitive configuration and reflect; properties hold objects and arrays. Never put JSON in an attribute.
- Components keep view state only (open, hovered, scrolled). Model data comes from facade queries; changes go through facade calls.
- Outgoing events are `new CustomEvent('strata:…', { bubbles: true, composed: true, detail })` with plain-data `detail`.
- Listeners and subscriptions are created in `connectedCallback` with an `AbortController` signal and released in `disconnectedCallback`. No timer outlives its element.
- Accessibility requirements come from the UI/UX Design System and are part of the definition of done.

---
Part of the [Strata Engineering Guidelines](README.md).
