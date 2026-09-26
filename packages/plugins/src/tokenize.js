/**
 * A small JavaScript tokenizer: enough to find module syntax (import, export, import.meta,
 * dynamic import) without being fooled by strings, template literals, comments or regular
 * expressions. It is not a parser; the bundler only needs statement-level structure.
 */

/**
 * @typedef {object} Token
 * @property {'name'|'punct'|'string'|'template'|'regex'|'number'|'private'} type
 * @property {string} value   the source text of the token
 * @property {number} start   offset of the first character
 * @property {number} end     offset after the last character
 * @property {number} depth   bracket depth ((), [], {}, ${}) before the token
 * @property {boolean} nl     a line break precedes the token
 * @property {number} line    1-based line of the first character
 */

const PUNCTUATORS = [
  '>>>=',
  '...',
  '===',
  '!==',
  '**=',
  '<<=',
  '>>=',
  '>>>',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**',
  '<<',
  '>>',
]

/** Keywords after which a `/` starts a regular expression rather than a division. */
const REGEX_AFTER = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])

const ID_START = /[A-Za-z_$\u0080-￿]/
const ID_PART = /[\w$\u0080-￿]/

export class SyntaxProblem extends Error {
  /** @param {string} message @param {number} line @param {number} column */
  constructor(message, line, column) {
    super(`${message} (line ${line}, column ${column})`)
    this.name = 'SyntaxProblem'
    this.line = line
    this.column = column
  }
}

/**
 * @param {string} src
 * @returns {Token[]}
 */
export function tokenize(src) {
  /** @type {Token[]} */
  const tokens = []
  /** Open brackets; 'T' marks a template substitution `${`. */
  const stack = []
  let i = 0
  let line = 1
  let nl = false

  const where = at => {
    const before = src.slice(0, at)
    const l = before.split('\n').length
    return [l, at - before.lastIndexOf('\n')]
  }
  const problem = (message, at) => {
    const [l, c] = where(at)
    return new SyntaxProblem(message, l, c)
  }
  const push = (type, start, end) => {
    tokens.push({ type, value: src.slice(start, end), start, end, depth: stack.length, nl, line })
    nl = false
  }
  const countLines = (from, to) => {
    for (let k = from; k < to; k++)
      if (src[k] === '\n') {
        line++
        nl = true
      }
  }
  const regexAllowed = () => {
    const prev = tokens[tokens.length - 1]
    if (!prev) return true
    if (prev.type === 'name') return REGEX_AFTER.has(prev.value)
    if (prev.type === 'punct') return ![')', ']'].includes(prev.value)
    return false
  }

  /** Scans template characters from `from` (just after ` or }) to the closing ` or `${`. */
  const templateChunk = from => {
    let k = from
    while (k < src.length) {
      const ch = src[k]
      if (ch === '\\') {
        k += 2
        continue
      }
      if (ch === '`') return { end: k + 1, open: false }
      if (ch === '$' && src[k + 1] === '{') return { end: k + 2, open: true }
      k++
    }
    throw problem('Unterminated template literal', from - 1)
  }

  if (src.startsWith('#!')) {
    const end = src.indexOf('\n')
    i = end < 0 ? src.length : end
  }

  while (i < src.length) {
    const ch = src[i]
    // whitespace
    if (ch === '\n') {
      line++
      nl = true
      i++
      continue
    }
    if (
      ch === ' ' ||
      ch === '\t' ||
      ch === '\r' ||
      ch === '\f' ||
      ch === '\v' ||
      ch === ' ' ||
      ch === '﻿' ||
      ch === ' ' ||
      ch === ' '
    ) {
      i++
      continue
    }
    // comments
    if (ch === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i)
      i = end < 0 ? src.length : end
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end < 0) throw problem('Unterminated comment', i)
      countLines(i, end)
      i = end + 2
      continue
    }
    const start = i
    // strings
    if (ch === '"' || ch === "'") {
      i++
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') i++
        else if (src[i] === '\n') throw problem('Unterminated string', start)
        i++
      }
      if (i >= src.length) throw problem('Unterminated string', start)
      i++
      push('string', start, i)
      continue
    }
    // template literals
    if (ch === '`') {
      const { end, open } = templateChunk(i + 1)
      const startLine = line
      countLines(i, end)
      tokens.push({
        type: 'template',
        value: src.slice(start, end),
        start,
        end,
        depth: stack.length,
        nl,
        line: startLine,
      })
      nl = false
      if (open) stack.push('T')
      i = end
      continue
    }
    if (ch === '}' && stack[stack.length - 1] === 'T') {
      stack.pop()
      const { end, open } = templateChunk(i + 1)
      const startLine = line
      countLines(i, end)
      tokens.push({
        type: 'template',
        value: src.slice(start, end),
        start,
        end,
        depth: stack.length,
        nl,
        line: startLine,
      })
      nl = false
      if (open) stack.push('T')
      i = end
      continue
    }
    // identifiers and keywords
    if (ID_START.test(ch) || (ch === '\\' && src[i + 1] === 'u')) {
      i++
      while (i < src.length && (ID_PART.test(src[i]) || src[i] === '\\')) i++
      push('name', start, i)
      continue
    }
    if (ch === '#' && ID_START.test(src[i + 1] ?? '')) {
      i++
      while (i < src.length && ID_PART.test(src[i])) i++
      push('private', start, i)
      continue
    }
    // numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const hex = ch === '0' && /[xXbBoO]/.test(src[i + 1] ?? '')
      i++
      while (i < src.length) {
        const c = src[i]
        if (/[\w.]/.test(c)) {
          i++
          continue
        }
        if ((c === '+' || c === '-') && !hex && /[eE]/.test(src[i - 1])) {
          i++
          continue
        }
        break
      }
      push('number', start, i)
      continue
    }
    // regular expressions
    if (ch === '/' && regexAllowed()) {
      i++
      let inClass = false
      while (i < src.length) {
        const c = src[i]
        if (c === '\\') {
          i += 2
          continue
        }
        if (c === '\n') throw problem('Unterminated regular expression', start)
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) break
        i++
      }
      if (i >= src.length) throw problem('Unterminated regular expression', start)
      i++
      while (i < src.length && ID_PART.test(src[i])) i++
      push('regex', start, i)
      continue
    }
    // brackets
    if (ch === '(' || ch === '[' || ch === '{') {
      push('punct', start, i + 1)
      stack.push(ch)
      i++
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      const open = stack.pop()
      if (open !== { ')': '(', ']': '[', '}': '{' }[ch]) throw problem(`Unexpected '${ch}'`, i)
      i++
      push('punct', start, i)
      continue
    }
    const op = PUNCTUATORS.find(p => src.startsWith(p, i))
    if (op && !(op === '?.' && /[0-9]/.test(src[i + 2] ?? ''))) {
      i += op.length
      push('punct', start, i)
      continue
    }
    i++
    push('punct', start, i)
  }
  if (stack.length) {
    const open = stack[stack.length - 1]
    throw problem(open === 'T' ? 'Unterminated template literal' : `Unclosed '${open}'`, src.length)
  }
  return tokens
}
