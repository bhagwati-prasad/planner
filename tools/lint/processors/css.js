// @ts-check
// Lets the JavaScript rules see a .css file: its text becomes one String.raw template literal,
// on the same lines, so rules such as strata/no-colour-literals report the right positions.
const PREFIX = 'export const css = String.raw`'

/** @type {import('eslint').Linter.Processor} */
export const processor = {
  meta: { name: 'strata/css', version: '0.1.0' },
  preprocess(text) {
    const body = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
    return [{ text: `${PREFIX}${body}\`\n`, filename: '0.js' }]
  },
  postprocess(messages) {
    return messages.flat().map(m => (m.line === 1 ? { ...m, column: m.column - PREFIX.length } : m))
  },
  supportsAutofix: false,
}
