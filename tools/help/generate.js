// @ts-check
/**
 * Generates `packages/facade/src/help-data.js`, the help metadata behind `strata.help()`, from
 * the JSDoc of the facade's exported classes (eng §20). Each public method gets its signature,
 * the first sentence of its description and its `@example`; each getter with a description gets
 * that sentence. Methods tagged `@internal` are left out. The `strata/facade-help` lint rule
 * makes sure every method has a description and an example.
 *
 *   node tools/help/generate.js    (npm run generate:help) rewrites the file
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Linter } from 'eslint'
import * as prettier from 'prettier'

const SRC = 'packages/facade/src'
export const OUTPUT = `${SRC}/help-data.js`

/**
 * @typedef {[name: string, params: string|null, summary: string, example?: string]} Entry
 *   params is null for a getter
 * @typedef {{ summary: string, example?: string, internal: boolean, params: { name: string, type: string }[] }} Doc
 */

/**
 * The text between a balanced pair of braces that opens at `start`.
 * @param {string} text @param {number} start
 */
function braced(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(start + 1, i)
  }
  return text.slice(start + 1)
}

/**
 * The top-level keys of an object type literal such as `{ name?: string, at?: { x: number } }`,
 * or none when the type is something else.
 * @param {string} type
 */
function typeKeys(type) {
  const t = type.trim()
  if (!t.startsWith('{') || braced(t, 0).length !== t.length - 2) return []
  const inner = braced(t, 0)
  const keys = []
  let depth = 0
  let from = 0
  for (let i = 0; i <= inner.length; i++) {
    const c = inner[i] ?? ','
    if (depth === 0 && (c === ',' || c === ';')) {
      const key = /^\s*([A-Za-z_$][\w$]*)\??\s*:/.exec(inner.slice(from, i))
      if (key) keys.push(key[1])
      from = i + 1
    } else if ('{[(<'.includes(c)) depth++
    else if ('}])'.includes(c) || (c === '>' && inner[i - 1] !== '=')) depth--
  }
  return keys
}

/**
 * Reads a JSDoc block: the summary (first sentence), the example, @internal and the @param tags.
 * @param {string} block the comment's text without its delimiters
 * @returns {Doc}
 */
export function parseDoc(block) {
  const text = block
    .split('\n')
    .map(line => line.replace(/^\s*\*?\s?/, ''))
    .join('\n')
  const firstTag = text.search(/(^|\s)@[a-z]/)
  const description = (firstTag < 0 ? text : text.slice(0, firstTag)).replace(/\s+/g, ' ').trim()
  const sentence = /^(.+?)(?<!\b(?:e\.g|i\.e|vs))\.(?:\s|$)/.exec(description)
  const example = /@example\s+([\s\S]*?)\s*(?=\n\s*@[a-z]|$)/.exec(text)?.[1]
  const params = []
  for (let at = text.indexOf('@param'); at >= 0; at = text.indexOf('@param', at + 1)) {
    let rest = text.slice(at + 6).trimStart()
    let type = ''
    if (rest.startsWith('{')) {
      type = braced(rest, 0)
      rest = rest.slice(type.length + 2).trimStart()
    }
    const name = /^\[?([\w$.]+)/.exec(rest)?.[1] ?? ''
    if (name && !name.includes('.')) params.push({ name, type })
  }
  return {
    summary: sentence ? sentence[1] : description.replace(/\.$/, ''),
    ...(example ? { example } : {}),
    internal: /(^|\s)@internal\b/.test(text),
    params,
  }
}

/**
 * How a parameter reads in help: an options object as its keys, a default only when it says
 * something (`= {}` does not).
 * @param {import('eslint').SourceCode} source
 * @param {any} param an estree parameter
 * @param {{ type: string }} [tag] its @param tag
 * @returns {string}
 */
function renderParam(source, param, tag) {
  const keys = tag ? typeKeys(tag.type) : []
  switch (param.type) {
    case 'AssignmentPattern': {
      const left = renderParam(source, param.left, tag)
      const fallback = source.getText(param.right)
      return fallback === '{}' ? left : `${left} = ${fallback}`
    }
    case 'ObjectPattern': {
      const own = param.properties
        .filter((/** @type {any} */ p) => p.type === 'Property')
        .map((/** @type {any} */ p) => source.getText(p.key))
      const rest = param.properties.find((/** @type {any} */ p) => p.type === 'RestElement')
      if (!rest) return `{ ${own.join(', ')} }`
      if (keys.length) return `{ ${[...keys, ...own.filter(k => !keys.includes(k))].join(', ')} }`
      return `{ ${[...own, `...${source.getText(rest.argument)}`].join(', ')} }`
    }
    case 'RestElement':
      return `...${renderParam(source, param.argument, tag)}`
    case 'Identifier':
      return keys.length ? `{ ${keys.join(', ')} }` : param.name
    default:
      return source.getText(param)
  }
}

/**
 * The help entries of every exported class in one source file, by class name.
 * @param {string} code
 * @returns {Record<string, Entry[]>}
 */
export function extractHelp(code) {
  /** @type {Record<string, Entry[]>} */
  const out = {}
  /** @param {import('eslint').SourceCode} source @param {any} program */
  const collect = (source, program) => {
    for (const node of program.body) {
      const cls = node.type === 'ExportNamedDeclaration' ? node.declaration : null
      if (cls?.type !== 'ClassDeclaration' || !cls.id) continue
      /** @type {Entry[]} */
      const entries = []
      for (const member of cls.body.body) {
        if (member.type !== 'MethodDefinition' || member.computed || member.static) continue
        if (member.key.type !== 'Identifier' || member.key.name.startsWith('_')) continue
        const comment = source.getCommentsBefore(member).at(-1)
        if (!comment || comment.type !== 'Block' || !comment.value.startsWith('*')) continue
        const doc = parseDoc(comment.value.slice(1))
        if (doc.internal || !doc.summary) continue
        const name = member.key.name
        if (member.kind === 'get') entries.push([name, null, doc.summary])
        else if (member.kind === 'method') {
          const params = member.value.params
            .map((/** @type {any} */ p, /** @type {number} */ i) =>
              renderParam(source, p, doc.params[i])
            )
            .join(', ')
          entries.push([name, params, doc.summary, ...(doc.example ? [doc.example] : [])])
        }
      }
      if (entries.length) out[cls.id.name] = entries
    }
  }
  const messages = new Linter().verify(
    code,
    [
      {
        files: ['**/*.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: {
          help: {
            rules: {
              collect: {
                meta: { type: 'suggestion', schema: [] },
                create: context => ({ Program: program => collect(context.sourceCode, program) }),
              },
            },
          },
        },
        rules: { 'help/collect': 'error' },
      },
    ],
    'facade.js'
  )
  const fatal = messages.find(m => m.fatal)
  if (fatal) throw new Error(`${fatal.line}:${fatal.column} ${fatal.message}`)
  return out
}

/**
 * The text of `help-data.js` for the facade source under `root`, formatted as Prettier would.
 * @param {string} root the repository root
 * @returns {Promise<string>}
 */
export async function generateHelp(root) {
  /** @type {Record<string, Entry[]>} */
  const help = {}
  for (const file of readdirSync(join(root, SRC)).sort()) {
    if (!file.endsWith('.js') || join(SRC, file) === OUTPUT) continue
    Object.assign(help, extractHelp(readFileSync(join(root, SRC, file), 'utf8')))
  }
  const text = [
    '// Generated by tools/help/generate.js from the JSDoc in this folder. Do not edit it: run',
    '// `npm run generate:help` after changing a facade method or its JSDoc.',
    '',
    '/**',
    ' * Help metadata for strata.help() (eng §20), by class: [name, parameters, summary, example].',
    ' * A getter has no parameters (null) and no example.',
    ' * @type {Record<string, [string, string|null, string, string?][]>}',
    ' */',
    `export const HELP = ${JSON.stringify(help)}`,
    '',
  ].join('\n')
  const filepath = join(root, OUTPUT)
  const options = await prettier.resolveConfig(filepath)
  return prettier.format(text, { ...options, filepath })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  writeFileSync(join(root, OUTPUT), await generateHelp(root))
  console.log(`Wrote ${OUTPUT}`)
}
