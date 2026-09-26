/**
 * A conservative minifier for bundles: drops comments and indentation and collapses
 * whitespace, but keeps every line break, so automatic semicolon insertion and therefore the
 * program's meaning are unchanged. Names are not mangled.
 */
import { tokenize } from './tokenize.js'

/**
 * @param {string} code
 * @returns {string}
 */
export function minify(code) {
  const tokens = tokenize(code)
  let out = ''
  let prev = null
  for (const t of tokens) {
    if (prev) {
      if (t.nl) out += '\n'
      else if (t.start > prev.end) out += ' '
    }
    out += t.value
    prev = t
  }
  return `${out}\n`
}
