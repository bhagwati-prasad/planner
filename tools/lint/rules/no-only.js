// @ts-check
// CLAUDE.md: never commit a focused test. Catches it.only, test.only, describe.only, suite.only
// and node:test's { only: true } option.
const RUNNERS = new Set(['it', 'test', 'describe', 'suite'])

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid focused tests' },
    schema: [],
    messages: { only: 'Focused test: remove .only (or { only: true }) so the whole suite runs.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          RUNNERS.has(callee.object.name) &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'only'
        ) {
          context.report({ node, messageId: 'only' })
          return
        }
        if (callee.type !== 'Identifier' || !RUNNERS.has(callee.name)) return
        for (const arg of node.arguments) {
          if (arg.type !== 'ObjectExpression') continue
          const only = arg.properties.find(
            p =>
              p.type === 'Property' &&
              !p.computed &&
              p.key.type === 'Identifier' &&
              p.key.name === 'only'
          )
          if (
            only &&
            only.type === 'Property' &&
            only.value.type === 'Literal' &&
            only.value.value === true
          )
            context.report({ node, messageId: 'only' })
        }
      },
    }
  },
}
