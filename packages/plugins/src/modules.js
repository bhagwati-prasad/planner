/**
 * The in-house module transform (spec §4 "Build", §7 "Packed bundle"): turns one ES module
 * into a plain function that a tiny runtime can call, so a set of modules can travel as one
 * classic script, a string in a component bundle, or a CommonJS file.
 *
 *   import { a as b } from './x.js'   →  const __m0 = __require("./x.js"); const b = __m0.a
 *   export function f () {}           →  function f () {}        + getter f → f
 *   export default expr               →  const __default = expr  + getter default → __default
 *   export * from './y.js'            →  exports every name of ./y.js except default
 *
 * A module made only of named re-exports, such as a package's index.js, requires each target
 * when one of its names is first read instead of when it starts, so the bundler can leave out
 * the targets nothing imports (bundle.js). The other modules evaluate as native modules do.
 *   import.meta / import('./z.js')    →  __meta / __import('./z.js')
 *
 * Imported bindings are captured when the importing module starts, not live: the bundler
 * rejects import cycles, which is the only case where that differs from native modules
 * (besides reassigning an exported `let`, which the transform reports).
 * Line numbers are preserved: removed statements leave their line breaks behind and the
 * generated header shares the first line, so errors point at the author's lines.
 */
import { tokenize, SyntaxProblem } from './tokenize.js'

/** Parameters of every wrapped module function. */
export const MODULE_PARAMS = ['__require', '__export', '__meta', '__import']
const RESERVED = new Set([...MODULE_PARAMS, '__default'])

/**
 * @typedef {object} ModuleImport
 * @property {string} specifier
 * @property {number} line
 * @property {{ imported: string, local: string }[]} bindings   imported '*' is the namespace
 * @property {{ imported: string, exported: string }[]} reexports
 * @property {boolean} star   `export * from`
 * @property {Record<string, string>|null} attributes  `with { type: 'json' }`
 *
 * @typedef {object} TransformedModule
 * @property {string} code        `function (__require, __export, __meta, __import) { ... }`
 * @property {ModuleImport[]} imports
 * @property {string[]} exports   names the module exports (not counting `export *`)
 * @property {string[]} [functionExports]  exports that are hoisted function declarations
 * @property {{ specifier: string|null, line: number }[]} dynamic  dynamic import() calls
 * @property {boolean} [reexportsOnly]  the module is only named re-exports, read lazily
 */

export class ModuleError extends Error {
  /** @param {string} message @param {number} [line] */
  constructor(message, line) {
    super(message)
    this.name = 'ModuleError'
    this.line = line
  }
}

/**
 * Wraps a JSON file as a module whose default export is the parsed value.
 * @param {string} text
 * @returns {TransformedModule}
 */
export function transformJson(text) {
  try {
    JSON.parse(text)
  } catch (err) {
    throw new ModuleError(`Invalid JSON: ${err.message}`)
  }
  return {
    code: `function (${MODULE_PARAMS.join(', ')}) { "use strict"; __export({ "default": () => __default }); const __default = ${text.trim()}\n}`,
    imports: [],
    exports: ['default'],
    dynamic: [],
  }
}

/**
 * @param {string} source an ES module
 * @returns {TransformedModule}
 */
export function transformModule(source) {
  let tokens
  try {
    tokens = tokenize(source)
  } catch (err) {
    if (err instanceof SyntaxProblem) throw new ModuleError(err.message, err.line)
    throw err
  }
  for (const t of tokens) {
    if (t.type === 'name' && RESERVED.has(t.value))
      throw new ModuleError(`'${t.value}' is reserved for the bundler; rename it`, t.line)
  }

  /** @type {{ start: number, end: number, text: string }[]} */
  const edits = []
  /** @type {ModuleImport[]} */
  const imports = []
  /** @type {Map<string, string>} exported name → local expression */
  const getters = new Map()
  const dynamic = []
  const exportedLets = new Set()

  const at = k => tokens[k]
  const value = k => tokens[k]?.value
  const fail = (message, k) => {
    throw new ModuleError(message, tokens[Math.min(k, tokens.length - 1)]?.line)
  }
  const expect = (k, v) => {
    if (value(k) !== v) fail(`Expected '${v}' but found '${value(k) ?? 'end of file'}'`, k)
  }
  /** Removes source text but keeps its line breaks. */
  const remove = (start, end) =>
    edits.push({ start, end, text: source.slice(start, end).replace(/[^\n]/g, '') })
  const addExport = (name, local, k) => {
    if (getters.has(name)) fail(`Duplicate export '${name}'`, k)
    getters.set(name, local)
  }
  const moduleName = k => {
    const t = at(k)
    if (t?.type === 'name') return t.value
    if (t?.type === 'string')
      return JSON.parse(
        t.value.startsWith("'") ? `"${t.value.slice(1, -1).replace(/"/g, '\\"')}"` : t.value
      )
    return fail(`Expected a name but found '${t?.value ?? 'end of file'}'`, k)
  }
  const specifier = k => {
    if (at(k)?.type !== 'string') fail('Expected a module specifier string', k)
    return moduleName(k)
  }
  /** Skips `with { type: 'json' }` and a trailing semicolon; returns [attributes, next index]. */
  const tail = k => {
    let attributes = null
    if ((value(k) === 'with' || (value(k) === 'assert' && !at(k).nl)) && value(k + 1) === '{') {
      attributes = {}
      let j = k + 2
      while (value(j) !== '}') {
        const key = moduleName(j)
        expect(j + 1, ':')
        attributes[key] = specifier(j + 2)
        j += 3
        if (value(j) === ',') j++
      }
      k = j + 1
    }
    if (value(k) === ';') k++
    return [attributes, k]
  }
  /** Parses `{ a, b as c, 'd' as e }` starting at '{'; returns [pairs, index after '}']. */
  const specifierList = k => {
    expect(k, '{')
    const pairs = []
    let j = k + 1
    while (value(j) !== '}') {
      const first = moduleName(j)
      let second = first
      j++
      if (value(j) === 'as') {
        second = moduleName(j + 1)
        j += 2
      }
      pairs.push([first, second])
      if (value(j) === ',') j++
      else if (value(j) !== '}')
        fail(`Expected ',' or '}' but found '${value(j) ?? 'end of file'}'`, j)
    }
    return [pairs, j + 1]
  }

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (t.type !== 'name') continue
    const prev = tokens[k - 1]
    if (prev && (prev.value === '.' || prev.value === '?.')) continue

    if (t.value === 'import') {
      if (value(k + 1) === '(' && !isMethod(tokens, k + 1)) {
        edits.push({ start: t.start, end: t.end, text: '__import' })
        dynamic.push({
          specifier:
            at(k + 2)?.type === 'string' && [')', ','].includes(value(k + 3))
              ? specifier(k + 2)
              : null,
          line: t.line,
        })
        continue
      }
      if (value(k + 1) === '.') {
        if (value(k + 2) !== 'meta') fail("Only 'import.meta' is supported", k)
        edits.push({ start: t.start, end: at(k + 2).end, text: '__meta' })
        k += 2
        continue
      }
      // Elsewhere `import` is an object key or a method name.
      if (t.depth !== 0) continue
      /** @type {ModuleImport} */
      const record = {
        specifier: '',
        line: t.line,
        bindings: [],
        reexports: [],
        star: false,
        attributes: null,
      }
      let j = k + 1
      if (at(j)?.type !== 'string') {
        if (at(j)?.type === 'name' && value(j) !== 'from') {
          record.bindings.push({ imported: 'default', local: value(j) })
          j++
          if (value(j) === ',') j++
        } else if (
          at(j)?.type === 'name' &&
          value(j) === 'from' &&
          value(j + 1) !== '{' &&
          at(j + 1)?.type === 'name'
        ) {
          // `import from from '...'`: a default import named 'from'
          record.bindings.push({ imported: 'default', local: 'from' })
          j++
        }
        if (value(j) === '*') {
          expect(j + 1, 'as')
          record.bindings.push({ imported: '*', local: moduleName(j + 2) })
          j += 3
        } else if (value(j) === '{') {
          const [pairs, next] = specifierList(j)
          for (const [imported, local] of pairs) record.bindings.push({ imported, local })
          j = next
        }
        expect(j, 'from')
        j++
      }
      record.specifier = specifier(j)
      const [attributes, next] = tail(j + 1)
      record.attributes = attributes
      remove(t.start, at(next - 1).end)
      imports.push(record)
      k = next - 1
      continue
    }

    if (t.value === 'await' && t.depth === 0)
      fail('Top-level await is not supported in bundled modules; move it into a function', k)

    if (t.value !== 'export' || t.depth !== 0) continue
    const n = value(k + 1)

    if (n === '{') {
      const [pairs, next] = specifierList(k + 1)
      if (value(next) === 'from') {
        const spec = specifier(next + 1)
        const [attributes, end] = tail(next + 2)
        imports.push({
          specifier: spec,
          line: t.line,
          bindings: [],
          reexports: pairs.map(([imported, exported]) => ({ imported, exported })),
          star: false,
          attributes,
        })
        for (const [, exported] of pairs)
          if (getters.has(exported)) fail(`Duplicate export '${exported}'`, k)
        remove(t.start, at(end - 1).end)
        k = end - 1
      } else {
        for (const [local, exported] of pairs) addExport(exported, local, k)
        const end = value(next) === ';' ? next + 1 : next
        remove(t.start, at(end - 1).end)
        k = end - 1
      }
      continue
    }

    if (n === '*') {
      let j = k + 2
      let exported = null
      if (value(j) === 'as') {
        exported = moduleName(j + 1)
        j += 2
      }
      expect(j, 'from')
      const spec = specifier(j + 1)
      const [attributes, end] = tail(j + 2)
      imports.push({
        specifier: spec,
        line: t.line,
        bindings: [],
        reexports: exported ? [{ imported: '*', exported }] : [],
        star: !exported,
        attributes,
      })
      remove(t.start, at(end - 1).end)
      k = end - 1
      continue
    }

    if (n === 'default') {
      const m = k + 2
      const isAsyncFn = value(m) === 'async' && value(m + 1) === 'function' && !at(m + 1).nl
      if (value(m) === 'function' || isAsyncFn || value(m) === 'class') {
        let kw = isAsyncFn ? m + 1 : m
        if (value(kw + 1) === '*') kw++
        const nameTok = at(kw + 1)
        remove(t.start, at(m).start)
        if (nameTok?.type === 'name' && !(value(m) === 'class' && nameTok.value === 'extends')) {
          addExport('default', nameTok.value, k)
        } else {
          edits.push({ start: at(kw).end, end: at(kw).end, text: ' __default' })
          addExport('default', '__default', k)
        }
      } else {
        edits.push({ start: t.start, end: at(k + 1).end, text: 'const __default =' })
        addExport('default', '__default', k)
      }
      k += 1
      continue
    }

    if (n === 'const' || n === 'let' || n === 'var') {
      remove(t.start, at(k + 1).start)
      const names = declaredNames(tokens, k + 2, t.depth, fail)
      for (const name of names) {
        addExport(name, name, k)
        if (n !== 'const') exportedLets.add(name)
      }
      continue
    }

    if (n === 'function' || n === 'class' || (n === 'async' && value(k + 2) === 'function')) {
      let j = n === 'async' ? k + 2 : k + 1
      if (value(j + 1) === '*') j++
      const name = at(j + 1)
      if (name?.type !== 'name') fail(`export ${n} needs a name`, k)
      remove(t.start, at(k + 1).start)
      addExport(name.value, name.value, k)
      continue
    }

    fail(`Unsupported export form 'export ${n ?? ''}'`, k)
  }

  // Reassigned exported bindings would need live bindings; report them.
  if (exportedLets.size) {
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k]
      if (
        t.type === 'name' &&
        exportedLets.has(t.value) &&
        value(k - 1) !== '.' &&
        /^(=|\+=|-=|\*=|\/=|%=|\*\*=|<<=|>>=|>>>=|&=|\|=|\^=|&&=|\|\|=|\?\?=|\+\+|--)$/.test(
          value(k + 1) ?? ''
        )
      ) {
        const decl = tokens
          .slice(Math.max(0, k - 3), k)
          .some(x => ['let', 'var', ','].includes(x.value))
        if (!decl)
          fail(
            `The exported binding '${t.value}' is reassigned; importers would not see the change. Export a function or an object instead`,
            k
          )
      }
    }
  }

  // Build the output.
  edits.sort((a, b) => a.start - b.start)
  let body = ''
  let pos = 0
  for (const e of edits) {
    if (e.start < pos) throw new ModuleError('Internal error: overlapping edits')
    body += source.slice(pos, e.start) + e.text
    pos = e.end
  }
  body += source.slice(pos)
  if (body.startsWith('#!')) body = body.replace(/^#![^\n]*/, '')
  const reexportsOnly =
    imports.length > 0 &&
    getters.size === 0 &&
    dynamic.length === 0 &&
    imports.every(
      i => !i.bindings.length && !i.star && i.reexports.every(r => r.imported !== '*')
    ) &&
    tokenize(body).length === 0

  // The module's own getters are registered before its imports run, so a module that imports
  // it back through a cycle can already reach its (hoisted) functions, as with native modules.
  const getterList = map =>
    [...map].map(([name, local]) => `${JSON.stringify(name)}: () => ${local}`).join(', ')
  const header = [`__export({ ${getterList(getters)} });`]
  const hoisted = hoistedFunctions(tokens)
  const functionExports = [...getters]
    .filter(([, local]) => hoisted.has(local))
    .map(([name]) => name)
  /** @type {Map<string, string>} */
  const reexported = new Map()
  const stars = []
  imports.forEach((imp, i) => {
    const required = `__require(${JSON.stringify(imp.specifier)})`
    const m = reexportsOnly ? required : `__m${i}`
    if (!reexportsOnly) header.push(`const ${m} = ${required};`)
    for (const b of imp.bindings)
      header.push(`const ${b.local} = ${b.imported === '*' ? m : `${m}${access(b.imported)}`};`)
    for (const r of imp.reexports) {
      if (getters.has(r.exported) || reexported.has(r.exported))
        throw new ModuleError(`Duplicate export '${r.exported}'`, imp.line)
      reexported.set(r.exported, r.imported === '*' ? m : `${m}${access(r.imported)}`)
    }
    if (imp.star) stars.push(m)
  })
  if (reexported.size || stars.length) {
    header.push(
      `__export({ ${getterList(reexported)} }${stars.length ? `, [${stars.join(', ')}]` : ''});`
    )
  }

  return {
    code: `function (${MODULE_PARAMS.join(', ')}) { "use strict"; ${header.join(' ')} ${body}\n}`,
    imports,
    exports: [...getters.keys(), ...reexported.keys()],
    functionExports,
    dynamic,
    ...(reexportsOnly ? { reexportsOnly } : {}),
  }
}

/** Tokens after which a `function` keyword starts an expression, not a declaration. */
const EXPRESSION_BEFORE =
  /^(=|\(|,|:|\?|\[|\+|-|\*|\/|%|&&|\|\||\?\?|!|~|=>|return|typeof|void|new|delete|await|yield|in|of|instanceof|&|\||\^|<|>|<=|>=|==|===|!=|!==)$/

/**
 * Names of the function declarations at the top level of a module: they are hoisted, so they
 * exist before the module body runs.
 * @param {import('./tokenize.js').Token[]} tokens
 */
function hoistedFunctions(tokens) {
  const names = new Set()
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (t.type !== 'name' || t.value !== 'function' || t.depth !== 0) continue
    let before = k - 1
    if (tokens[before]?.value === 'async' && !t.nl) before--
    const prev = tokens[before]
    const statement =
      !prev ||
      [';', '}', '{', 'export', 'default'].includes(prev.value) ||
      (tokens[before + 1].nl && !EXPRESSION_BEFORE.test(prev.value))
    if (!statement) continue
    const name = tokens[k + 1]?.value === '*' ? tokens[k + 2] : tokens[k + 1]
    if (name?.type === 'name') names.add(name.value)
    // `export default function () {}` is declared as __default by the transform.
    else if (prev?.value === 'default') names.add('__default')
  }
  return names
}

/**
 * True when the parenthesis at `k` opens a method's parameters (`import () { ... }` in a class
 * or object literal) rather than a dynamic import call.
 * @param {import('./tokenize.js').Token[]} tokens
 * @param {number} k
 */
function isMethod(tokens, k) {
  const depth = tokens[k].depth
  let j = k + 1
  while (j < tokens.length && !(tokens[j].value === ')' && tokens[j].depth === depth)) j++
  return tokens[j + 1]?.value === '{'
}

/** Property access for an export name: `.name` or `["odd-name"]`. @param {string} name */
function access(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`
}

/**
 * Names bound by `const|let|var` declarators starting at `k` (just after the keyword).
 * @param {import('./tokenize.js').Token[]} tokens
 * @param {number} k
 * @param {number} depth  depth of the declaration statement
 * @param {(message: string, k: number) => never} fail
 */
function declaredNames(tokens, k, depth, fail) {
  const names = []
  const value = j => tokens[j]?.value

  /** Collects the names of a binding pattern at `j`; returns the index after it. */
  const pattern = j => {
    const t = tokens[j]
    if (t?.type === 'name') {
      names.push(t.value)
      return j + 1
    }
    if (value(j) === '{') {
      const inner = t.depth + 1
      j++
      while (value(j) !== '}') {
        if (value(j) === '...') {
          j = pattern(j + 1)
        } else {
          const key = tokens[j]
          if (value(j) === '[') {
            while (!(value(j) === ']' && tokens[j].depth === inner)) j++
          }
          j++
          if (value(j) === ':') j = pattern(j + 1)
          else if (key.type === 'name') names.push(key.value)
          else fail('Unsupported destructuring in an export', j)
          if (value(j) === '=') j = skipUntil(j + 1, inner, [',', '}'])
        }
        if (value(j) === ',') j++
      }
      return j + 1
    }
    if (value(j) === '[') {
      const inner = t.depth + 1
      j++
      while (value(j) !== ']') {
        if (value(j) === ',') {
          j++
          continue
        }
        j = pattern(value(j) === '...' ? j + 1 : j)
        if (value(j) === '=') j = skipUntil(j + 1, inner, [',', ']'])
        if (value(j) === ',') j++
      }
      return j + 1
    }
    return fail(
      `Expected a name in the exported declaration but found '${t?.value ?? 'end of file'}'`,
      j
    )
  }

  /** Index of the first token at `d` whose value is in `stops`. */
  const skipUntil = (j, d, stops) => {
    while (j < tokens.length && !(tokens[j].depth === d && stops.includes(tokens[j].value))) j++
    return j
  }

  let j = k
  for (;;) {
    j = pattern(j)
    if (value(j) === '=') j = skipInitializer(tokens, j + 1, depth)
    if (value(j) === ',' && tokens[j].depth === depth) {
      j++
      continue
    }
    return names
  }
}

const CONTINUES = new Set(['in', 'instanceof', 'of', 'as'])

/**
 * Skips an initializer expression; stops at ',' or ';' at the statement's depth, or where
 * automatic semicolon insertion ends the statement (a line break between a complete
 * expression and a token that cannot continue it).
 * @param {import('./tokenize.js').Token[]} tokens
 * @param {number} j
 * @param {number} depth
 */
function skipInitializer(tokens, j, depth) {
  const start = j
  for (; j < tokens.length; j++) {
    const t = tokens[j]
    if (t.depth !== depth) continue
    if (t.value === ',' || t.value === ';') return j
    if (t.nl && j > start && endsExpression(tokens[j - 1]) && startsStatement(t)) return j
  }
  return j
}

/** @param {import('./tokenize.js').Token} t */
function endsExpression(t) {
  if (t.type === 'punct') return [')', ']', '}', '++', '--'].includes(t.value)
  if (t.type === 'template') return t.value.endsWith('`')
  return true
}

/** @param {import('./tokenize.js').Token} t */
function startsStatement(t) {
  if (t.type === 'name') return !CONTINUES.has(t.value)
  return (
    t.type === 'string' ||
    t.type === 'number' ||
    t.type === 'private' ||
    (t.type === 'template' && t.value.startsWith('`'))
  )
}
