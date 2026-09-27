// @ts-check
/**
 * Shortens the names of local variables, parameters and private class members, keeping the
 * source's layout. `minify(code, { rename: true })` compacts the result.
 *
 * It works on tokens, without a parser, so it renames only what it can prove it understands
 * and leaves every other name as it is:
 *
 * - A binding is a parameter, a catch parameter, or a `const` or `let` declared inside a block
 *   or a `for` head, including the names inside destructuring patterns. Names declared at the
 *   top level of a file, with `var`, or by function and class declarations keep their names, so
 *   exports, globals and every function's and class's `name` stay the same.
 * - A binding's region is exactly the code that can see it: its block, its `for` statement, or
 *   its function's parameters and body. Every occurrence of its name in the region that is a
 *   reference gets the new name, and so does a nested declaration of the same name that the
 *   renamer does not treat as a binding, since renaming both keeps the shadowing as it was.
 * - Property names, object keys and class members keep their names. A shorthand property
 *   `{ x }` becomes `{ x: a }`.
 * - A binding keeps its name when anything in its region is ambiguous: a label, a class member,
 *   a brace it cannot classify, a function whose `name` would come from it, a `var`, or a `for`
 *   body whose end it cannot place.
 * - New names appear nowhere else in the file, and two bindings share one only when their
 *   regions do not overlap, so a renamed reference never resolves to a different binding.
 *
 * A file that uses `eval`, `with` or escaped identifiers is returned unchanged.
 */
import { tokenize } from './tokenize.js'

/** @typedef {import('./tokenize.js').Token} Token */

/**
 * @typedef {object} Binding
 * @property {string} name
 * @property {number[]} decls    tokens that declare it
 * @property {number} start      first token of its region
 * @property {number} end        the token after its region
 * @property {number[]} tokens   occurrences of its name in its region that belong to it
 * @property {boolean} unsafe
 * @property {boolean} poison    its region may reach past its real end, so bindings of the
 *   same name around it keep their names too
 * @property {string} [short]    its new name
 */

/** Words that are never a binding's name and cannot end an expression. */
const KEYWORDS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'return',
  'switch',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

/** Words a new name must not be. */
const RESERVED = new Set([
  ...KEYWORDS,
  'false',
  'null',
  'super',
  'this',
  'true',
  'as',
  'async',
  'from',
  'get',
  'implements',
  'interface',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'set',
  'static',
  'arguments',
  'eval',
  'undefined',
  'NaN',
  'Infinity',
])

/** Names a binding may have but keeps, because they also mean something in some positions. */
const KEEP = new Set([
  'arguments',
  'as',
  'async',
  'constructor',
  'eval',
  'from',
  'get',
  'meta',
  'of',
  'set',
  'static',
  'target',
  'undefined',
  '__proto__',
])

/** Keywords before a parenthesis that is not a parameter list. */
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'with'])

/** Assignments that give an anonymous function its `name`. */
const NAMING = new Set(['=', '||=', '&&=', '??='])

/** Punctuators after which no statement can end, so a line break after them continues it. */
const CONTINUES_AFTER = new Set(
  '{ ( [ , ; : ? . ?. ... => = += -= *= /= %= **= <<= >>= >>>= &= |= ^= &&= ||= ??= == === != !== < > <= >= + - * / % ** & | ^ << >> >>> && || ?? ! ~'.split(
    ' '
  )
)

/** Punctuators that cannot start a statement, so a line break before them continues it. */
const CONTINUES_BEFORE = new Set(
  '. ?. , ; : ? ) ] } = += -= *= /= %= **= <<= >>= >>>= &= |= ^= &&= ||= ??= => == === != !== < > <= >= * ** % & | ^ << >> >>> && || ??'.split(
    ' '
  )
)

/** @param {Token|undefined} t @param {string} value */
const isPunct = (t, value) => t !== undefined && t.type === 'punct' && t.value === value
/** @param {Token|undefined} t @param {string} value */
const isWord = (t, value) => t !== undefined && t.type === 'name' && t.value === value

/** Whether an expression can end with the token. @param {Token} t */
function canEnd(t) {
  if (t.type === 'name') return !KEYWORDS.has(t.value)
  if (t.type === 'template') return t.value.endsWith('`')
  if (t.type === 'punct') return [')', ']', '}', '++', '--'].includes(t.value)
  return true
}

/** Whether the token cannot continue an expression, so a statement starts with it. @param {Token} t */
function isStarter(t) {
  if (t.type === 'name') return t.value !== 'in' && t.value !== 'instanceof'
  if (t.type === 'punct') return ['{', '!', '~', '++', '--'].includes(t.value)
  return t.type !== 'template'
}

/** Whether a line break between the tokens can be a semicolon. @param {Token} prev @param {Token} t */
const mayEndAt = (prev, t) =>
  !(prev.type === 'punct' && CONTINUES_AFTER.has(prev.value)) &&
  !(t.type === 'punct' && CONTINUES_BEFORE.has(t.value)) &&
  !isWord(t, 'in') &&
  !isWord(t, 'instanceof')

/**
 * @param {string} code
 * @returns {string}
 */
export function renameLocals(code) {
  const tokens = tokenize(code)
  const r = new Renamer(tokens)
  if (!r.renamable()) return code
  const out = r.run()
  let text = ''
  let at = 0
  tokens.forEach((t, i) => {
    text += code.slice(at, t.start) + out[i]
    at = t.end
  })
  return text + code.slice(at)
}

class Renamer {
  /** @param {Token[]} tokens */
  constructor(tokens) {
    this.t = tokens
    const n = tokens.length
    /** The innermost open bracket or template substitution around each token, or -1. */
    this.parent = new Int32Array(n).fill(-1)
    /** The closing token of each opening one. */
    this.close = new Int32Array(n).fill(-1)
    /** The opening token of each closing one. */
    this.open = new Int32Array(n).fill(-1)
    /** @type {Map<number, 'block'|'object'|'class'|'unknown'|'params'|'for'|'paren'|'bracket'|'template'>} */
    this.kind = new Map()
    /** @type {Binding[]} */
    this.bindings = []
    this.#structure()
  }

  /** Whether the file can be renamed at all. */
  renamable() {
    return !this.t.some(
      (t, i) =>
        t.type === 'name' &&
        (t.value.includes('\\') ||
          ((t.value === 'eval' || t.value === 'with') && !this.#isProperty(i)))
    )
  }

  /** @returns {string[]} the new text of every token */
  run() {
    const out = this.t.map(t => t.value)
    this.#collect()
    this.#attribute()
    const used = new Set(this.t.filter(t => t.type === 'name').map(t => t.value))
    const pool = new Pool(name => !used.has(name))
    /** @type {Binding[]} */
    const active = []
    const safe = this.bindings
      .filter(b => !b.unsafe)
      .sort((a, b) => a.start - b.start || b.end - a.end)
    for (const b of safe) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= b.start) active.splice(i, 1)
      const taken = new Set(active.map(a => a.short))
      b.short = pool.first(name => !taken.has(name))
      active.push(b)
    }
    for (const b of safe)
      for (const k of b.tokens) {
        const role = this.#role(k)
        if (role === 'ref') out[k] = /** @type {string} */ (b.short)
        else if (role === 'shorthand') out[k] = `${b.name}:${b.short}`
      }
    this.#privates(out)
    return out
  }

  #structure() {
    this.#brackets()
    const classBodies = this.#classBodies()
    const { t, kind } = this
    for (let i = 0; i < t.length; i++) {
      if (isPunct(t[i], '{')) kind.set(i, classBodies.has(i) ? 'class' : this.#braceKind(i))
      else if (isPunct(t[i], '(')) {
        const isFor =
          this.#keyword(i - 1, 'for') || (isWord(t[i - 1], 'await') && this.#keyword(i - 2, 'for'))
        kind.set(i, isFor ? 'for' : this.#paramsAt(i) ? 'params' : 'paren')
      }
    }
  }

  /** Matches brackets and template substitutions, and finds the one around each token. */
  #brackets() {
    const { t, parent, close, open, kind } = this
    /** @type {number[]} */
    const stack = []
    for (let i = 0; i < t.length; i++) {
      const tok = t[i]
      const closes =
        (tok.type === 'punct' && (tok.value === ')' || tok.value === ']' || tok.value === '}')) ||
        (tok.type === 'template' && tok.value[0] === '}')
      if (closes) {
        const o = /** @type {number} */ (stack.pop())
        close[o] = i
        open[i] = o
      }
      parent[i] = stack.length ? stack[stack.length - 1] : -1
      if (tok.type === 'template' && tok.value.endsWith('${')) {
        kind.set(i, 'template')
        stack.push(i)
      } else if (tok.type === 'punct' && tok.value === '[') {
        kind.set(i, 'bracket')
        stack.push(i)
      } else if (tok.type === 'punct' && (tok.value === '(' || tok.value === '{')) stack.push(i)
    }
  }

  /** The `{` of every class body. */
  #classBodies() {
    const { t, parent, close } = this
    /** @type {Set<number>} */
    const bodies = new Set()
    for (let i = 0; i < t.length; i++) {
      if (!isWord(t[i], 'class') || this.#isProperty(i)) continue
      const next = t[i + 1]
      if (!next || !(next.type === 'name' || isPunct(next, '{'))) continue
      for (let j = i + 1; j < t.length; j++) {
        if (parent[j] !== parent[i]) continue
        if (isPunct(t[j], '{')) {
          bodies.add(j)
          break
        }
        if (isPunct(t[j], ';') || close[parent[i]] === j) break
      }
    }
    return bodies
  }

  /** Whether a name token is a property: after `.` or `?.`, or an object key. @param {number} i */
  #isProperty(i) {
    return this.#afterDot(i) || isPunct(this.t[i + 1], ':')
  }

  /** @param {number} i */
  #afterDot(i) {
    const prev = this.t[i - 1]
    return isPunct(prev, '.') || isPunct(prev, '?.')
  }

  /** Whether the token is the keyword, not a property of that name. @param {number} i @param {string} word */
  #keyword(i, word) {
    return isWord(this.t[i], word) && !this.#afterDot(i)
  }

  /** @param {number} i  a `{` */
  #braceKind(i) {
    const { t } = this
    const p = t[i - 1]
    const nl = t[i].nl
    if (!p) return 'block'
    if (p.type === 'template' && p.value.endsWith('${')) return 'object'
    if (p.type === 'punct') {
      if ([')', '=>', ';', '{', '}'].includes(p.value)) return 'block'
      if (p.value === ':') {
        const colon = this.#colonKind(i - 1)
        return colon === 'case' || colon === 'label' ? 'block' : 'object'
      }
      if ([']', '++', '--'].includes(p.value)) return nl ? 'block' : 'unknown'
      return 'object'
    }
    if (p.type === 'name') {
      if (['else', 'try', 'finally', 'do', 'static'].includes(p.value)) return 'block'
      if (['return', 'throw', 'yield'].includes(p.value)) return nl ? 'block' : 'object'
      if (
        [
          'typeof',
          'void',
          'delete',
          'await',
          'in',
          'of',
          'instanceof',
          'new',
          'case',
          'const',
          'let',
          'var',
        ].includes(p.value)
      )
        return 'object'
    }
    return nl ? 'block' : 'unknown'
  }

  /**
   * What a `:` outside an object literal separates: a ternary, a `case`, or a label.
   * @param {number} c
   * @returns {'object'|'ternary'|'case'|'label'}
   */
  #colonKind(c) {
    const { t, parent } = this
    const par = parent[c]
    if (par >= 0 && this.kind.get(par) === 'object') return 'object'
    let depth = 0
    for (let k = c - 1; k > par; k--) {
      if (parent[k] !== par) continue
      const tok = t[k]
      if (isPunct(tok, '?')) {
        if (depth === 0) return 'ternary'
        depth--
      } else if (isPunct(tok, ':')) depth++
      else if (this.#keyword(k, 'case') || this.#keyword(k, 'default')) return 'case'
    }
    return 'label'
  }

  /**
   * Whether a statement or expression goes on after the token even at a line break: it closes
   * the head of a control statement or a function, or it comes before a class body.
   * @param {number} k
   */
  #goesOn(k) {
    const { t } = this
    if (isPunct(t[k + 1], '{') && this.kind.get(k + 1) === 'class') return true
    if (!isPunct(t[k], ')')) return false
    const o = this.open[k]
    const before = o - 1
    if (
      ['if', 'while', 'for', 'with', 'switch', 'catch', 'function'].some(w =>
        this.#keyword(before, w)
      )
    )
      return true
    if (isWord(t[before], 'await') && this.#keyword(before - 1, 'for')) return true
    // function name(, function* (, function* name(
    const star = isPunct(t[before], '*') ? before : isPunct(t[before - 1], '*') ? before - 1 : -1
    if (star >= 0 && this.#keyword(star - 1, 'function')) return true
    return t[before]?.type === 'name' && this.#keyword(before - 1, 'function')
  }

  /** Whether the `(` starts the parameters of a function, method or catch clause. @param {number} i */
  #paramsAt(i) {
    const { t, close } = this
    const c = close[i]
    if (isPunct(t[c + 1], '=>')) return true
    const body = t[c + 1]
    if (!isPunct(body, '{') || body.nl) return false
    const before = t[i - 1]
    if (!before) return false
    if (before.type === 'private' || isPunct(before, ']') || isPunct(before, '*')) return true
    if (before.type !== 'name' || CONTROL.has(before.value)) return false
    return !(isWord(before, 'await') && isWord(t[i - 2], 'for'))
  }

  #collect() {
    const { t, close, kind } = this
    for (let i = 0; i < t.length; i++) {
      const tok = t[i]
      if (isPunct(tok, '=>')) this.#arrow(i)
      else if (isPunct(tok, '(') && kind.get(i) === 'params' && !isPunct(t[close[i] + 1], '=>')) {
        const body = close[i] + 1
        this.#declare(this.#params(i), i, close[body] + 1)
      } else if (
        (isWord(tok, 'const') || isWord(tok, 'let')) &&
        !this.#isProperty(i) &&
        t[i + 1] &&
        (t[i + 1].type === 'name' || isPunct(t[i + 1], '{') || isPunct(t[i + 1], '['))
      )
        this.#declaration(i)
    }
  }

  /** @param {number} a  a `=>` */
  #arrow(a) {
    const { t, open, close } = this
    const before = t[a - 1]
    let start
    /** @type {number[]} */
    let names
    if (isPunct(before, ')')) {
      start = open[a - 1]
      names = this.#params(start)
    } else if (before?.type === 'name') {
      start = a - 1
      names = [a - 1]
    } else return
    const end = isPunct(t[a + 1], '{') ? close[a + 1] + 1 : this.#conciseEnd(a)
    this.#declare(names, start, end)
  }

  /**
   * The names a parameter list declares.
   * @param {number} p  its `(`
   */
  #params(p) {
    /** @type {number[]} */
    const names = []
    for (const first of this.#elements(p)) this.#target(first, names, true)
    return names
  }

  /**
   * The first token of each comma-separated element directly inside a bracket.
   * @param {number} o
   */
  #elements(o) {
    const { t, parent, close } = this
    const firsts = []
    let expect = true
    for (let k = o + 1; k < close[o]; k++) {
      if (parent[k] !== o) continue
      if (isPunct(t[k], ',')) expect = true
      else if (expect) {
        firsts.push(k)
        expect = false
      }
    }
    return firsts
  }

  /**
   * Adds the names a binding target declares: a name, `...name`, a pattern, each with an
   * optional default.
   * @param {number} k
   * @param {number[]} names
   * @param {boolean} [rest]
   */
  #target(k, names, rest = false) {
    const { t } = this
    if (rest && isPunct(t[k], '...')) k++
    const tok = t[k]
    if (!tok) return
    if (tok.type === 'name' && !KEYWORDS.has(tok.value)) names.push(k)
    else if (isPunct(tok, '[')) for (const e of this.#elements(k)) this.#target(e, names, true)
    else if (isPunct(tok, '{'))
      for (const e of this.#elements(k)) {
        const key = t[e]
        if (isPunct(key, '...')) this.#target(e + 1, names)
        else if (key.type === 'name' && !isPunct(t[e + 1], ':')) this.#target(e, names)
        else if (isPunct(key, '[')) {
          if (isPunct(t[this.close[e] + 1], ':')) this.#target(this.close[e] + 2, names)
        } else if (isPunct(t[e + 1], ':')) this.#target(e + 2, names)
      }
  }

  /** @param {number} d  a `const` or `let` */
  #declaration(d) {
    const { t, parent, close, kind } = this
    const p = parent[d]
    if (p < 0) return
    if (kind.get(p) === 'block') {
      this.#declare(this.#declarators(d, p, false), p, close[p] + 1)
      return
    }
    if (kind.get(p) !== 'for') return
    const names = this.#declarators(d, p, true)
    const region = this.#forEnd(p)
    if (region === null) {
      this.#declare(names, p, parent[p] < 0 ? t.length : close[parent[p]], 'poison')
      return
    }
    const [min, most] = region
    const clash = names.some(n => {
      for (let j = min; j < most; j++) if (isWord(t[j], t[n].value)) return true
      return false
    })
    if (clash) this.#declare(names, p, most, 'poison')
    else this.#declare(names, p, min)
  }

  /**
   * The names declared by the declarators after `d`, up to the end of the declaration.
   * @param {number} d
   * @param {number} p  the bracket around the declaration
   * @param {boolean} head  inside a `for` head
   */
  #declarators(d, p, head) {
    const { t, parent, close } = this
    /** @type {number[]} */
    const names = []
    this.#target(d + 1, names)
    for (let k = d + 2; k < t.length && k !== close[p]; k++) {
      if (parent[k] !== p) continue
      const tok = t[k]
      if (isPunct(tok, ';')) break
      if (head && (isWord(tok, 'of') || isWord(tok, 'in'))) break
      if (tok.nl && this.#endsAt(k)) break
      if (isPunct(tok, ',')) this.#target(k + 1, names)
    }
    return names
  }

  /**
   * Where a `for` statement ends: after its block, or for a single statement, the first place
   * it could end and the place by which it must have ended. Null when it cannot tell.
   * @param {number} p  the `(` of its head
   * @returns {[number, number]|null}
   */
  #forEnd(p) {
    const { t, parent, close } = this
    const b = close[p] + 1
    if (!t[b]) return null
    if (isPunct(t[b], '{')) return [close[b] + 1, close[b] + 1]
    if (isWord(t[b], 'do')) return null
    const P = parent[p]
    const limit = P < 0 ? t.length : close[P]
    let min = -1
    for (let k = b + 1; k < limit; k++) {
      if (parent[k] !== P) continue
      const tok = t[k]
      const prev = t[k - 1]
      const afterSemi = isPunct(prev, ';')
      const boundary =
        afterSemi ||
        (isPunct(prev, '}') && !this.#goesOn(k - 1)) ||
        (tok.nl && mayEndAt(prev, tok) && !this.#goesOn(k - 1))
      if (!boundary) continue
      if (min < 0) min = k
      const continues = ['else', 'while', 'catch', 'finally'].some(w => isWord(tok, w))
      if (!continues && (afterSemi || (canEnd(prev) && isStarter(tok)))) return [min, k]
    }
    return [min < 0 ? limit : min, limit]
  }

  /**
   * Where a concise arrow body ends: at a `,`, `;` or unmatched `:`, at the bracket around
   * it, or at a line break where a semicolon is inserted.
   * @param {number} a  the `=>`
   */
  #conciseEnd(a) {
    const { t, parent, close } = this
    const P = parent[a]
    const limit = P < 0 ? t.length : close[P]
    let pending = 0
    for (let k = a + 2; k < limit; k++) {
      if (parent[k] !== P) continue
      const tok = t[k]
      if (isPunct(tok, ',') || isPunct(tok, ';')) return k
      if (isPunct(tok, '?')) pending++
      else if (isPunct(tok, ':')) {
        if (pending === 0) return k
        pending--
      }
      if (tok.nl && this.#endsAt(k)) return k
    }
    return limit
  }

  /**
   * Whether a statement ends at the line break before the token: one is inserted there,
   * because the token cannot go on with what comes before it.
   * @param {number} k
   */
  #endsAt(k) {
    const { t } = this
    const prev = t[k - 1]
    return mayEndAt(prev, t[k]) && canEnd(prev) && isStarter(t[k]) && !this.#goesOn(k - 1)
  }

  /**
   * @param {number[]} names  tokens that declare
   * @param {number} start
   * @param {number} end
   * @param {'poison'} [flag]
   */
  #declare(names, start, end, flag) {
    for (const k of names)
      this.bindings.push({
        name: this.t[k].value,
        decls: [k],
        start,
        end,
        tokens: [],
        unsafe: flag === 'poison' || KEEP.has(this.t[k].value),
        poison: flag === 'poison',
      })
  }

  /** Gives each occurrence of a name to the innermost binding of that name around it. */
  #attribute() {
    const { t } = this
    /** @type {Map<string, Binding[]>} */
    const byName = new Map()
    for (const b of this.bindings) {
      const list = byName.get(b.name)
      if (list) list.push(b)
      else byName.set(b.name, [b])
    }
    /** @type {Map<string, number[]>} */
    const uses = new Map()
    t.forEach((tok, k) => {
      if (tok.type !== 'name' || !byName.has(tok.value)) return
      if (isPunct(t[k - 1], '.') || isPunct(t[k - 1], '?.')) return
      const list = uses.get(tok.value)
      if (list) list.push(k)
      else uses.set(tok.value, [k])
    })
    for (const [name, list] of byName) {
      list.sort((a, b) => a.start - b.start || b.end - a.end)
      for (let i = 1; i < list.length; i++)
        for (let j = 0; j < i; j++) {
          const [a, b] = [list[j], list[i]]
          if (b.start < a.end && b.end > a.end) a.unsafe = b.unsafe = true
          if (b.poison && b.end <= a.end) a.unsafe = true
        }
      /** @type {Binding[]} */
      const stack = []
      let next = 0
      for (const k of uses.get(name) ?? []) {
        while (next < list.length && list[next].start <= k) {
          const b = list[next++]
          while (stack.length && stack[stack.length - 1].end <= b.start) stack.pop()
          stack.push(b)
        }
        while (stack.length && stack[stack.length - 1].end <= k) stack.pop()
        const owner = stack[stack.length - 1]
        if (owner) owner.tokens.push(k)
      }
    }
    /** How many `var` declarations come before each token. */
    const vars = new Int32Array(t.length + 1)
    t.forEach((tok, k) => {
      vars[k + 1] = vars[k] + (isWord(tok, 'var') && !this.#isProperty(k) ? 1 : 0)
    })
    for (const b of this.bindings) {
      if (b.decls.some(d => !b.tokens.includes(d))) b.unsafe = true
      if (b.tokens.some(k => this.#role(k) === 'unsafe')) b.unsafe = true
      if (vars[b.end] > vars[b.start]) b.unsafe = true
    }
  }

  /**
   * What an occurrence of a binding's name is: a reference to rename, a shorthand property
   * to expand, a key or label that keeps its name, or something that makes renaming unsafe.
   * @param {number} k
   * @returns {'ref'|'shorthand'|'key'|'unsafe'}
   */
  #role(k) {
    const { t, parent, kind } = this
    const prev = t[k - 1]
    const next = t[k + 1]
    const par = parent[k]
    const context = par < 0 ? 'top' : kind.get(par)
    /** @type {'ref'|'shorthand'} */
    let role = 'ref'
    if (context === 'unknown') return 'unsafe'
    if (context === 'object' || context === 'class') {
      const modifiers =
        context === 'object' ? ['get', 'set', 'async'] : ['get', 'set', 'async', 'static']
      let j = k - 1
      while (j > par && (isPunct(t[j], '*') || modifiers.some(m => isWord(t[j], m)))) j--
      const before = t[j]
      const key =
        context === 'object'
          ? j === par || (isPunct(before, ',') && parent[j] === par)
          : j === par ||
            ((isPunct(before, ';') || isPunct(before, '}')) && parent[j] === par) ||
            (t[j + 1].nl && canEnd(before))
      if (key) {
        const plain = j === k - 1
        if (isPunct(next, '(') || (plain && isPunct(next, ':') && context === 'object'))
          return 'key'
        if (context === 'class')
          return !next || ['=', ';', '}'].some(v => isPunct(next, v)) || next.nl ? 'key' : 'unsafe'
        if (plain && (isPunct(next, ',') || isPunct(next, '}') || isPunct(next, '=')))
          role = 'shorthand'
        else return 'unsafe'
      }
    } else {
      if ((isWord(prev, 'break') || isWord(prev, 'continue')) && !t[k].nl) return 'key'
      if (isPunct(next, ':') && this.#colonKind(k + 1) === 'label') return 'unsafe'
      if (isWord(prev, 'function') || isWord(prev, 'class')) return 'unsafe'
      if (isPunct(prev, '*') && isWord(t[k - 2], 'function')) return 'unsafe'
    }
    if (next && next.type === 'punct' && NAMING.has(next.value) && this.#startsFunction(k + 2))
      return 'unsafe'
    return role
  }

  /** Whether an anonymous function or class starts at the token. @param {number} k */
  #startsFunction(k) {
    const { t, close } = this
    while (isPunct(t[k], '(')) {
      if (isPunct(t[close[k] + 1], '=>')) return true
      k++
    }
    const tok = t[k]
    if (!tok || tok.type !== 'name') return false
    return (
      tok.value === 'function' ||
      tok.value === 'class' ||
      tok.value === 'async' ||
      isPunct(t[k + 1], '=>')
    )
  }

  /** Gives every private member a short name, the most used first. @param {string[]} out */
  #privates(out) {
    /** @type {Map<string, number>} */
    const counts = new Map()
    for (const tok of this.t)
      if (tok.type === 'private') counts.set(tok.value, (counts.get(tok.value) ?? 0) + 1)
    const pool = new Pool(() => true)
    /** @type {Map<string, string>} */
    const names = new Map()
    const taken = new Set()
    for (const [name] of [...counts].sort((a, b) => b[1] - a[1])) {
      const short = pool.first(n => !taken.has(n))
      taken.add(short)
      names.set(name, `#${short}`)
    }
    this.t.forEach((tok, k) => {
      if (tok.type === 'private') out[k] = /** @type {string} */ (names.get(tok.value))
    })
  }
}

const FIRST = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'
const REST = `${FIRST}0123456789`

/** Short names in order, a, b, … $, aa, ab, …, skipping reserved words and names not allowed. */
class Pool {
  /** @param {(name: string) => boolean} allowed */
  constructor(allowed) {
    this.allowed = allowed
    /** @type {string[]} */
    this.names = []
    this.index = 0
  }

  /** @param {number} i */
  #nth(i) {
    while (this.names.length <= i) {
      const name = Pool.#spell(this.index++)
      if (!RESERVED.has(name) && this.allowed(name)) this.names.push(name)
    }
    return this.names[i]
  }

  /** The first name the predicate accepts. @param {(name: string) => boolean} ok */
  first(ok) {
    for (let i = 0; ; i++) {
      const name = this.#nth(i)
      if (ok(name)) return name
    }
  }

  /** @param {number} n */
  static #spell(n) {
    let name = FIRST[n % FIRST.length]
    n = Math.floor(n / FIRST.length)
    while (n > 0) {
      n--
      name += REST[n % REST.length]
      n = Math.floor(n / REST.length)
    }
    return name
  }
}
