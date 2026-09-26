// @ts-check
// eng §14: every promise is awaited or handed to an error handler. This is a heuristic (the
// linter has no type information); tools/lint/README.md lists what it catches and what it misses.

/** @param {any} node */
const keyName = node =>
  node.type === 'PrivateIdentifier'
    ? `#${node.name}`
    : node.type === 'Identifier'
      ? node.name
      : null

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Promises must be awaited, returned, or given a rejection handler (eng §14)',
    },
    schema: [],
    messages: {
      floating:
        'Floating promise: await it, return it, add .catch(handler), or mark a deliberate fire-and-forget with void (eng §14).',
    },
  },
  create(context) {
    /** Async functions and methods declared in this file, by name. */
    const asyncFunctions = new Set()
    const asyncMethods = new Set()
    /** @type {any[]} */
    const statements = []

    /** @param {any} call */
    function isFloating(call) {
      if (call.type === 'NewExpression')
        return call.callee.type === 'Identifier' && call.callee.name === 'Promise'
      if (call.type !== 'CallExpression') return false
      const callee = call.callee
      if (callee.type === 'Identifier') return asyncFunctions.has(callee.name)
      if (callee.type !== 'MemberExpression') return false
      const name = keyName(callee.property)
      if (name === 'then') return call.arguments.length < 2
      return callee.object.type === 'ThisExpression' && asyncMethods.has(name)
    }

    return {
      FunctionDeclaration(node) {
        if (node.async && node.id) asyncFunctions.add(node.id.name)
      },
      VariableDeclarator(node) {
        const init = /** @type {any} */ (node.init)
        if (
          init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') &&
          init.async &&
          node.id.type === 'Identifier'
        ) {
          asyncFunctions.add(node.id.name)
        }
      },
      MethodDefinition(node) {
        const name = keyName(node.key)
        if (node.value.async && name) asyncMethods.add(name)
      },
      ExpressionStatement(node) {
        statements.push(node)
      },
      // Decide at the end, once every declaration in the file has been seen.
      'Program:exit'() {
        for (const node of statements)
          if (isFloating(node.expression)) context.report({ node, messageId: 'floating' })
      },
    }
  },
}
