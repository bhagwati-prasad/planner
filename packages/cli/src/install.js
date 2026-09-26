/**
 * `strata pack --install strata.html`: adds a component's script tag between the markers of
 * the offline app page (spec §7 "Loading paths").
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, sep } from 'node:path'

export const BEGIN_MARKER = '<!-- STRATA:COMPONENTS:BEGIN'
export const END_MARKER = '<!-- STRATA:COMPONENTS:END -->'

/**
 * Inserts `<script src="…">` for `scriptPath` into the component block of `htmlPath`.
 * @param {string} htmlPath
 * @param {string} scriptPath
 * @returns {Promise<boolean>} false when the tag was already there
 */
export async function installScriptTag(htmlPath, scriptPath) {
  const html = await readFile(htmlPath, 'utf8')
  const begin = html.indexOf(BEGIN_MARKER)
  const end = html.indexOf(END_MARKER)
  if (begin < 0 || end < begin) {
    throw new Error(
      `${htmlPath} has no component block. Add these two lines where component scripts belong:\n${BEGIN_MARKER} - one line per packed component -->\n${END_MARKER}`
    )
  }
  const src = relative(dirname(htmlPath), scriptPath).split(sep).join('/')
  const block = html.slice(begin, end)
  if (block.includes(`src="${src}"`)) return false
  const lineStart = html.lastIndexOf('\n', end) + 1
  const indent = /^[ \t]*/.exec(html.slice(lineStart, end))?.[0] ?? ''
  const tag = `${indent}<script src="${src.replace(/"/g, '&quot;')}"></script>\n`
  await writeFile(htmlPath, html.slice(0, lineStart) + tag + html.slice(lineStart))
  return true
}
