// @ts-check
// eng §11: component CSS uses semantic tokens only (var(--st-…)). Hex, rgb()/hsl()-style and
// named colours are rejected in declarations; custom property definitions (the tokens
// themselves) may hold raw values. Checks .css files (through the strata/css processor) and
// `static css` fields of custom elements.

// CSS named colours (CSS Color Module Level 4), excluding keywords such as transparent and currentColor.
const NAMED =
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
const COLOUR = new RegExp(
  `#[0-9a-f]{3,8}(?![\\w-])|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<![\\w-])(?:${NAMED.split(' ').join('|')})(?![\\w-])`,
  'gi'
)
const DECLARATION = /([\w-]+)\s*:\s*([^;{}]*)/g

/**
 * Colour literals in CSS text, as [offset, text] pairs.
 * @param {string} css
 * @returns {[number, string][]}
 */
export function colourLiterals(css) {
  // Blank out comments and strings, keeping offsets.
  const text = css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, m =>
    ' '.repeat(m.length)
  )
  /** @type {[number, string][]} */
  const out = []
  for (const decl of text.matchAll(DECLARATION)) {
    if (decl[1].startsWith('--')) continue
    const valueAt = /** @type {number} */ (decl.index) + decl[0].length - decl[2].length
    for (const hit of decl[2].matchAll(COLOUR)) {
      if (hit[0].startsWith('#') && ![4, 5, 7, 9].includes(hit[0].length)) continue
      out.push([valueAt + /** @type {number} */ (hit.index), hit[0]])
    }
  }
  return out
}

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Component CSS uses semantic tokens, never colour literals (eng §11)' },
    schema: [],
    messages: {
      literal:
        "Colour literal '{{value}}': use a semantic token such as var(--st-color-…) (eng §11).",
    },
  },
  create(context) {
    const source = context.sourceCode

    /** @param {import('estree').TemplateLiteral | import('estree').Literal} node */
    function check(node) {
      const parts = node.type === 'TemplateLiteral' ? node.quasis : [node]
      for (const part of parts) {
        const raw =
          part.type === 'TemplateElement'
            ? part.value.raw
            : typeof part.value === 'string'
              ? /** @type {string} */ (part.raw).slice(1, -1)
              : null
        if (raw === null || !part.range) continue
        for (const [offset, value] of colourLiterals(raw)) {
          const start = source.getLocFromIndex(part.range[0] + 1 + offset)
          const end = source.getLocFromIndex(part.range[0] + 1 + offset + value.length)
          context.report({ loc: { start, end }, messageId: 'literal', data: { value } })
        }
      }
    }

    if (context.physicalFilename.endsWith('.css')) return { TemplateLiteral: check }
    return {
      PropertyDefinition(node) {
        if (
          !node.static ||
          node.computed ||
          node.key.type !== 'Identifier' ||
          node.key.name !== 'css'
        )
          return
        if (node.value?.type === 'TemplateLiteral' || node.value?.type === 'Literal')
          check(node.value)
      },
    }
  },
}
