// @ts-check
// eng §11: dynamic values go through textContent and setAttribute. innerHTML (and outerHTML,
// insertAdjacentHTML) takes only static templates or the output of a sanitiser.

/** @param {any} node */
function isStatic(node) {
  if (!node) return false
  if (node.type === 'Literal') return typeof node.value === 'string'
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0
  if (node.type === 'CallExpression') {
    const callee = node.callee.type === 'MemberExpression' ? node.callee.property : node.callee
    return callee.type === 'Identifier' && /^sanitiz/i.test(callee.name)
  }
  return false
}

/** @param {any} node */
const propertyName = node =>
  node.type === 'MemberExpression'
    ? node.computed
      ? node.property.value
      : node.property.name
    : null

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Allow HTML strings only from static templates or a sanitiser (eng §11)' },
    schema: [],
    messages: {
      dynamic:
        'Dynamic HTML: set text with textContent and attributes with setAttribute, or pass rich text through the sanitiser (eng §11).',
    },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        if (!['innerHTML', 'outerHTML'].includes(propertyName(node.left))) return
        if (node.operator !== '=' || !isStatic(node.right))
          context.report({ node, messageId: 'dynamic' })
      },
      CallExpression(node) {
        if (propertyName(node.callee) === 'insertAdjacentHTML' && !isStatic(node.arguments[1])) {
          context.report({ node, messageId: 'dynamic' })
        }
      },
    }
  },
}
