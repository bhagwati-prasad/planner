// The element harness (eng §18 "Component"): one page that mounts one custom element in
// isolation. Tests drive it through the `mount` fixture in tools/testing/playwright.js.
import { loadFonts } from './fonts.js'

/**
 * Loads the element's module, creates the element and puts it alone in #host.
 * @param {{ tag: string, module?: string, attributes?: Record<string, string>, properties?: Record<string, unknown> }} spec
 */
async function mount({ tag, module, attributes = {}, properties = {} }) {
  if (module) await import(module)
  if (!customElements.get(tag))
    throw new Error(`${tag} is not defined by ${module ?? 'any loaded module'}`)
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  Object.assign(element, properties)
  document.getElementById('host')?.replaceChildren(element)
}

await loadFonts()
Object.assign(window, { mount, harnessReady: true })
