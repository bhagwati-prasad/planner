// @ts-check
// eng §20: every facade method carries help metadata (a summary, a signature and an example),
// which powers strata.help(). In source, that is a JSDoc block with a description, @param tags
// for the signature, and an @example. Applies to the public methods of exported classes and to
// exported functions in packages/facade/src.
import { locate } from '../guidelines.js'

/**
 * The JSDoc block right before a node, or null.
 * @param {import('eslint').SourceCode} source
 * @param {import('estree').Node} node
 */
function jsdocOf(source, node) {
  const comment = source.getCommentsBefore(node).at(-1)
  return comment && comment.type === 'Block' && comment.value.startsWith('*') ? comment.value : null
}

/** @param {string} jsdoc */
function parse(jsdoc) {
  const lines = jsdoc.split('\n').map(line => line.replace(/^\s*\*?\s?/, ''))
  const firstTag = lines.findIndex(line => line.trimStart().startsWith('@'))
  const description = (firstTag < 0 ? lines : lines.slice(0, firstTag)).join(' ').trim()
  return { description, tags: new Set(lines.flatMap(line => line.match(/@\w+/g) ?? [])) }
}

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Facade methods carry help metadata: summary, signature and example (eng §20)',
    },
    schema: [],
    messages: {
      missing:
        "'{{name}}' has no help metadata: add a JSDoc block with a summary, @param tags and an @example (eng §20).",
      noSummary: "'{{name}}' needs a one-line summary in its JSDoc for strata.help() (eng §20).",
      noExample: "'{{name}}' needs an @example in its JSDoc for strata.help() (eng §20).",
    },
  },
  create(context) {
    const here = locate(context.filename)
    if (!here || here.pkg !== 'facade' || here.area !== 'src') return {}
    const source = context.sourceCode

    /** @param {import('estree').Node} node @param {string} name */
    function require(node, name) {
      const jsdoc = jsdocOf(source, node)
      if (!jsdoc) return context.report({ node, messageId: 'missing', data: { name } })
      const { description, tags } = parse(jsdoc)
      if (tags.has('@internal')) return
      if (!description) context.report({ node, messageId: 'noSummary', data: { name } })
      else if (!tags.has('@example'))
        context.report({ node, messageId: 'noExample', data: { name } })
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration
        if (decl?.type === 'FunctionDeclaration' && decl.id) require(node, decl.id.name)
        if (decl?.type !== 'ClassDeclaration' || !decl.id) return
        for (const member of decl.body.body) {
          if (member.type !== 'MethodDefinition' || member.kind !== 'method' || member.computed)
            continue
          if (member.key.type !== 'Identifier' || member.key.name.startsWith('_')) continue
          require(member, `${decl.id.name}.${member.key.name}`)
        }
      },
    }
  },
}
