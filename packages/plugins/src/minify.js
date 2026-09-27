/**
 * The in-house minifier for bundles. It drops comments, indentation and every space or line
 * break the program cannot notice, and keeps every token in order. With `rename`, it first
 * gives local variables, parameters and private class members short names (rename.js).
 *
 * A line break stays when automatic semicolon insertion could depend on it: the token before it
 * could end a statement and the token after it could start one, or it follows a restricted
 * production (return, throw, break, continue, yield, async). A space stays only where the two
 * tokens would otherwise merge into one, start a comment, or change a number or a regular
 * expression.
 */
import { tokenize } from './tokenize.js'
import { renameLocals } from './rename.js'

/** Punctuators after which no statement can end, so a line break after them is never a semicolon. */
const CONTINUES_AFTER = new Set([
  '{',
  '(',
  '[',
  ',',
  ';',
  ':',
  '?',
  '.',
  '?.',
  '...',
  '=>',
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
  '&&',
  '||',
  '??',
  '!',
  '~',
])

/** Punctuators that cannot start a statement, so a line break before them is never a semicolon. */
const CONTINUES_BEFORE = new Set([
  '.',
  '?.',
  ',',
  ';',
  ':',
  '?',
  ')',
  ']',
  '}',
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
  '*',
  '**',
  '%',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
  '&&',
  '||',
  '??',
])

/** Operators spelled as words, which cannot start a statement either. */
const CONTINUES_BEFORE_WORDS = new Set(['in', 'instanceof'])

/**
 * Words that cannot start a statement but may need one ended first: in `if (a) b()\nelse c()`
 * the line break is the semicolon that ends `b()`. After `}` or `;` it is not.
 */
const AFTER_BLOCK_WORDS = new Set(['else', 'catch', 'finally'])

/** Words whose production ends at a line break: `return\nx` returns undefined. */
const RESTRICTED = new Set(['return', 'throw', 'break', 'continue', 'yield', 'async'])

/** @typedef {import('./tokenize.js').Token} Token */

/** @param {Token} token */
const isPunct = token => token.type === 'punct'

/**
 * Whether the line break between two tokens can go without changing the program.
 * @param {Token} prev
 * @param {Token} next
 */
function lineBreakIsInert(prev, next) {
  if (prev.type === 'name' && RESTRICTED.has(prev.value)) return false
  return (
    (isPunct(prev) && CONTINUES_AFTER.has(prev.value)) ||
    (isPunct(next) && CONTINUES_BEFORE.has(next.value)) ||
    (next.type === 'name' && CONTINUES_BEFORE_WORDS.has(next.value)) ||
    (next.type === 'name' && AFTER_BLOCK_WORDS.has(next.value) && /^[};]$/.test(prev.value))
  )
}

/** @param {string} ch */
const isWordChar = ch => /[\w$\\]/.test(ch) || ch > '\x7f'

/**
 * Whether two tokens need a space between them to stay two tokens with the same meaning.
 * @param {Token} prev
 * @param {Token} next
 */
function needsSpace(prev, next) {
  const a = prev.value.at(-1) ?? ''
  const b = next.value[0] ?? ''
  if (isWordChar(a) && isWordChar(b)) return true // `return x`, `typeof y`, `a in b`
  if ((a === '+' || a === '-') && b === a) return true // `a + +b` is not `a ++b`
  if (a === '/' && (b === '/' || b === '*')) return true // would start a comment
  if (prev.type === 'regex' && isWordChar(b)) return true // `/x/ in o` is not the flags `in`
  if (prev.type === 'number' && b === '.') return true // `1 .toString()` is not `1.`
  if (a === '<' && b === '!') return true // `<!--` starts a comment in scripts
  if (prev.value.endsWith('--') && b === '>') return true // and so can `-->`
  return false
}

/**
 * @param {string} code
 * @param {{ rename?: boolean }} [options]  rename: shorten local names too
 * @returns {string}
 */
export function minify(code, { rename = false } = {}) {
  const tokens = tokenize(rename ? renameLocals(code) : code)
  let out = ''
  /** @type {Token|null} */
  let prev = null
  for (const t of tokens) {
    if (prev) {
      if (t.nl && !lineBreakIsInert(prev, t)) out += '\n'
      else if ((t.nl || t.start > prev.end) && needsSpace(prev, t)) out += ' '
    }
    out += t.value
    prev = t
  }
  return `${out}\n`
}
