/**
 * Word wrapping for labels and sticky notes. The measuring function comes from the host:
 * canvas `measureText` in a browser, an estimate in Node.
 */

/**
 * @param {string} text
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 * @param {{ maxLines?: number, ellipsis?: string }} [options]
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, measure, { maxLines = Infinity, ellipsis = '…' } = {}) {
  const lines = []
  for (const paragraph of String(text ?? '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (!line || measure(candidate) <= maxWidth) {
        line = candidate
        // A single word wider than the line is broken by characters.
        while (measure(line) > maxWidth && line.length > 1) {
          let cut = line.length - 1
          while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--
          lines.push(line.slice(0, cut))
          line = line.slice(cut)
        }
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && measure(last + ellipsis) > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = (last ?? '') + ellipsis
  return kept
}

/**
 * A rough width estimate for Node and tests: average glyph width of a proportional font.
 * @param {number} fontSize
 */
export const estimateMeasure = fontSize => (/** @type {string} */ s) => s.length * fontSize * 0.56

/**
 * One line of text within `maxWidth`: whole when it fits, otherwise cut at a character and
 * ended with an ellipsis, as CSS `text-overflow: ellipsis` does (design system §6 titles).
 * @param {string} text
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 * @param {string} [ellipsis]
 * @returns {string}
 */
export function truncateText(text, maxWidth, measure, ellipsis = '…') {
  const s = String(text ?? '')
  if (measure(s) <= maxWidth) return s
  let cut = s.length
  while (cut > 0 && measure(`${s.slice(0, cut).trimEnd()}${ellipsis}`) > maxWidth) cut--
  return `${s.slice(0, cut).trimEnd()}${ellipsis}`
}
