// @ts-check
// Loads IBM Plex from vendor/plex before a harness says it is ready, so no test measures or
// draws text in a fallback font (task 0210).
//
// The faces are made from the files' bytes rather than declared with @font-face, so no stylesheet
// font holds the page's load event; a fetch does not. (Firefox's missing load events in CI turned
// out to reach pages without fonts too: see page.goto in ../playwright.js.) Harness pages are
// served, never opened from file://, so the fetch always works.

/** The faces the browser tests use: Sans regular and semibold, Mono regular. */
export const FACES = Object.freeze([
  { family: 'IBM Plex Sans', weight: '400', file: 'IBMPlexSans-Regular-Latin1.woff2' },
  { family: 'IBM Plex Sans', weight: '600', file: 'IBMPlexSans-SemiBold-Latin1.woff2' },
  { family: 'IBM Plex Mono', weight: '400', file: 'IBMPlexMono-Regular-Latin1.woff2' },
])

const PLEX = new URL('../../../vendor/plex/', import.meta.url)

/** Resolves once every face in FACES is loaded into the document; rejects when one is missing. */
export async function loadFonts() {
  await Promise.all(
    FACES.map(async ({ family, weight, file }) => {
      const response = await fetch(new URL(file, PLEX))
      if (!response.ok) throw new Error(`IBM Plex did not load: ${file} (${response.status})`)
      const face = new FontFace(family, await response.arrayBuffer(), { weight, style: 'normal' })
      document.fonts.add(await face.load())
    })
  )
}
