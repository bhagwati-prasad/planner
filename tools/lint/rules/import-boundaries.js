// @ts-check
// eng §4 and §6: a package imports only the packages the eng §6 table allows, only through
// their src/index.js, and no npm packages (d3 and three where the table says so; node:
// built-ins in the Node-only packages). Applies to package sources, not their tests.
import { dirname, join, resolve } from 'node:path'
import { boundaries, locate, NODE_PACKAGES, ROOT } from '../guidelines.js'

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce the package dependency table of eng §6 and index-only imports (eng §4)',
    },
    schema: [],
    messages: {
      notAllowed: "'{{from}}' may not import '{{to}}'. eng §6 allows {{allowed}}.",
      notIndex:
        "Import '{{to}}' through packages/{{to}}/src/index.js, its only public entry point (eng §4).",
      bare: "'{{spec}}' cannot be imported in '{{from}}': no npm packages; only {{allowed}} (eng §6).",
      outside:
        "'{{spec}}' is outside packages/; package code imports only other packages' entry points.",
    },
  },
  create(context) {
    const here = locate(context.filename)
    if (!here || here.area !== 'src') return {}
    const { packages, bare } = boundaries()
    const allowed = packages.get(here.pkg) ?? new Set()
    const list = (/** @type {Iterable<string>} */ items) =>
      [...items].map(s => `'${s}'`).join(', ') || 'nothing'

    /** @param {import('estree').Node & { value?: unknown }} source */
    function check(source) {
      const spec = typeof source.value === 'string' ? source.value : null
      if (spec === null) return
      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        const ok = spec.startsWith('node:')
          ? NODE_PACKAGES.has(here.pkg)
          : bare.get(here.pkg)?.has(spec)
        const permitted = [
          ...(bare.get(here.pkg) ?? []),
          ...(NODE_PACKAGES.has(here.pkg) ? ['node: built-ins'] : []),
        ]
        if (!ok)
          context.report({
            node: source,
            messageId: 'bare',
            data: { spec, from: here.pkg, allowed: list(permitted) },
          })
        return
      }
      const target = resolve(dirname(context.filename), spec)
      const there = locate(target)
      if (!there) {
        context.report({ node: source, messageId: 'outside', data: { spec } })
        return
      }
      if (there.pkg === here.pkg) return
      if (!allowed.has(there.pkg)) {
        context.report({
          node: source,
          messageId: 'notAllowed',
          data: { from: here.pkg, to: there.pkg, allowed: list(allowed) },
        })
      } else if (target !== join(ROOT, 'packages', there.pkg, 'src', 'index.js')) {
        context.report({ node: source, messageId: 'notIndex', data: { to: there.pkg } })
      }
    }

    return {
      ImportDeclaration: node => check(node.source),
      ExportAllDeclaration: node => check(node.source),
      ExportNamedDeclaration: node => node.source && check(node.source),
      ImportExpression: node => check(node.source),
    }
  },
}
