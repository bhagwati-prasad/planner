// @ts-check
/**
 * Expressions (ADR 0019): the language of `when` routing rules, which conditional breakpoints
 * and watches (spec §13) can reuse. An in-house parser turns the text into closures once, and
 * nothing is evaluated as code, so it works under the strict CSP and inside the sandbox.
 *
 * It has literals (numbers, quoted text, true, false, null), the names it is given, member
 * access with `.` and `[…]`, `== != === !== < <= > >=`, `&& || !`, unary minus and parentheses.
 * `==` compares without converting types, and `<` and the other orderings compare only numbers
 * with numbers and text with text. Member access reads only what a value holds itself (and the
 * length of text), so a missing member is undefined rather than an error, and nothing reaches a
 * prototype.
 */
import { StrataError } from '../../core/src/index.js'

/** @typedef {(scope: Record<string, unknown>) => unknown} Evaluate */

/** Numbers, quoted text, names and operators, after any white space. */
const TOKEN =
  /\s*(?:(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_$][\w$]*)|(===|!==|==|!=|<=|>=|&&|\|\||[<>!\-.[\]()]))/y

/** @type {Map<string, unknown>} */
const LITERALS = new Map([
  ['true', true],
  ['false', false],
  ['null', null],
])

/** @param {unknown} a @param {unknown} b */
const alike = (a, b) =>
  (typeof a === 'number' && typeof b === 'number') ||
  (typeof a === 'string' && typeof b === 'string')

/** @type {Map<string, (a: any, b: any) => boolean>} */
const COMPARE = new Map([
  ['==', (a, b) => a === b],
  ['===', (a, b) => a === b],
  ['!=', (a, b) => a !== b],
  ['!==', (a, b) => a !== b],
  ['<', (a, b) => alike(a, b) && a < b],
  ['<=', (a, b) => alike(a, b) && a <= b],
  ['>', (a, b) => alike(a, b) && a > b],
  ['>=', (a, b) => alike(a, b) && a >= b],
])

/**
 * What a value holds under a key: its own data only.
 * @param {unknown} value @param {unknown} key
 */
function member(value, key) {
  if (typeof value === 'string') return key === 'length' ? value.length : undefined
  if (typeof value !== 'object' || value === null) return undefined
  const name = typeof key === 'number' ? String(key) : key
  return typeof name === 'string' && Object.hasOwn(value, name)
    ? /** @type {any} */ (value)[name]
    : undefined
}

/**
 * The tokens of an expression.
 * @param {string} text @param {(why: string) => never} bad
 * @returns {{ kind: 'number'|'text'|'name'|'op', value: string }[]}
 */
function tokens(text, bad) {
  const out = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex
    const m = TOKEN.exec(text)
    if (!m) {
      if (!text.slice(at).trim()) break
      bad(`'${text.slice(at).trim()[0]}' at ${at + 1} is not part of the language`)
    }
    const [, number, quoted, name, op] = m
    if (number !== undefined) out.push({ kind: 'number', value: number })
    else if (quoted !== undefined)
      out.push({ kind: 'text', value: quoted.slice(1, -1).replace(/\\(.)/g, '$1') })
    else if (name !== undefined) out.push({ kind: 'name', value: name })
    else out.push({ kind: 'op', value: op })
  }
  return /** @type {any} */ (out)
}

/**
 * An expression compiled once into a function of its scope.
 * @param {string} text
 * @param {string[]} names  the names it may use, such as `msg`
 * @returns {Evaluate}
 * @example compile('msg.body.total > 1000', ['msg'])({ msg }) // true or false
 */
export function compile(text, names) {
  /** @param {string} why @returns {never} */
  const bad = why => {
    throw new StrataError(
      'E_SIM_EXPRESSION_INVALID',
      `${JSON.stringify(text)} is not an expression: ${why}`
    )
  }
  const list = tokens(text, bad)
  let i = 0
  /** @param {string} op */
  const take = op => (list[i]?.kind === 'op' && list[i].value === op ? (i++, true) : false)

  /** @returns {Evaluate} */
  const either = () => {
    let left = both()
    while (take('||')) {
      const [l, r] = [left, both()]
      left = s => l(s) || r(s)
    }
    return left
  }
  /** @returns {Evaluate} */
  const both = () => {
    let left = compare()
    while (take('&&')) {
      const [l, r] = [left, compare()]
      left = s => l(s) && r(s)
    }
    return left
  }
  /** @returns {Evaluate} */
  const compare = () => {
    const left = unary()
    const op = list[i]?.kind === 'op' ? COMPARE.get(list[i].value) : undefined
    if (!op) return left
    i++
    const right = unary()
    return s => op(left(s), right(s))
  }
  /** @returns {Evaluate} */
  const unary = () => {
    if (take('!')) {
      const x = unary()
      return s => !x(s)
    }
    if (take('-')) {
      const x = unary()
      return s => {
        const v = x(s)
        return typeof v === 'number' ? -v : undefined
      }
    }
    return access()
  }
  /** @returns {Evaluate} */
  const access = () => {
    let value = primary()
    for (;;) {
      if (take('.')) {
        const t = list[i++]
        if (t?.kind !== 'name') bad('a name must follow a dot')
        const [of, key] = [value, t.value]
        value = s => member(of(s), key)
      } else if (take('[')) {
        const [of, key] = [value, either()]
        if (!take(']')) bad('a [ has no ]')
        value = s => member(of(s), key(s))
      } else return value
    }
  }
  /** @returns {Evaluate} */
  const primary = () => {
    const t = list[i++]
    if (!t) return bad('it ends too soon')
    if (t.kind === 'number' || t.kind === 'text') {
      const v = t.kind === 'number' ? Number(t.value) : t.value
      return () => v
    }
    if (t.kind === 'name') {
      if (LITERALS.has(t.value)) {
        const v = LITERALS.get(t.value)
        return () => v
      }
      if (!names.includes(t.value)) bad(`it can use only ${names.join(', ')}, not '${t.value}'`)
      const name = t.value
      return s => s[name]
    }
    if (t.value === '(') {
      const x = either()
      if (!take(')')) bad('a ( has no )')
      return x
    }
    return bad(`'${t.value}' is out of place`)
  }

  const evaluate = either()
  if (i < list.length) bad(`'${list[i].value}' is out of place`)
  return evaluate
}
