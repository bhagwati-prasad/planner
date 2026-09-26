// @ts-check
// eng §2 and §6: headless packages never read the wall clock, randomness, timers, the console or
// browser globals directly; those come from injected adapters. The list of packages and globals
// is read from eng §6.
import { boundaries, locate } from '../guidelines.js'

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban wall-clock, randomness, timer, console and browser globals in headless packages (eng §6)',
    },
    schema: [],
    messages: {
      banned:
        "'{{name}}' is banned in '{{pkg}}' (eng §6). Take it from an injected adapter: clock, scheduler, PRNG, logger or storage.",
    },
  },
  create(context) {
    const here = locate(context.filename)
    const { bannedIn, bannedGlobals } = boundaries()
    if (!here || here.area !== 'src' || !bannedIn.has(here.pkg)) return {}
    const plain = new Set(bannedGlobals.filter(g => /^\w+$/.test(g)))
    const members = bannedGlobals.filter(g => /^\w+\.\w+$/.test(g)).map(g => g.split('.'))
    const newDate = bannedGlobals.includes('new Date()')

    /** @param {import('estree').Node} node @param {string} name */
    const report = (node, name) =>
      context.report({ node, messageId: 'banned', data: { name, pkg: here.pkg } })

    return {
      'Program:exit'(program) {
        const scope = context.sourceCode.getScope(program)
        // References to globals: unresolved ones, and configured globals (variables without definitions).
        const refs = [
          ...scope.through,
          ...scope.variables.filter(v => v.defs.length === 0).flatMap(v => v.references),
        ]
        for (const { identifier: id } of refs) {
          const parent = /** @type {any} */ (id).parent
          if (plain.has(id.name)) {
            report(id, id.name)
          } else if (
            parent?.type === 'MemberExpression' &&
            parent.object === id &&
            !parent.computed
          ) {
            const hit = members.find(
              ([object, property]) => object === id.name && property === parent.property.name
            )
            if (hit) report(parent, hit.join('.'))
          } else if (
            newDate &&
            id.name === 'Date' &&
            parent?.type === 'NewExpression' &&
            parent.callee === id &&
            parent.arguments.length === 0
          ) {
            report(parent, 'new Date()')
          }
        }
      },
    }
  },
}
