// @ts-check
// Loads IBM Plex (tools/testing/browser/fonts.css) before a harness says it is ready, so no test
// measures or draws text in a fallback font (task 0210).

/** The faces the browser tests use: Sans regular and semibold, Mono regular. */
export const FONTS = Object.freeze([
  '400 12px "IBM Plex Sans"',
  '600 12px "IBM Plex Sans"',
  '400 12px "IBM Plex Mono"',
])

/** Resolves once every face in FONTS has loaded; rejects when one is missing. */
export async function loadFonts() {
  const faces = (await Promise.all(FONTS.map(font => document.fonts.load(font)))).flat()
  if (faces.length < FONTS.length)
    throw new Error('IBM Plex did not load: is tools/testing/browser/fonts.css linked?')
}
