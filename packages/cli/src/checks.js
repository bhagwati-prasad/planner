/**
 * The checks `strata validate` adds to packing (spec §8, eng §10, design system §13): the rules
 * for component icons, and determinism checks on behaviour code.
 */
import { tokenize } from '../../server/src/index.js'

/** @typedef {import('../../server/src/index.js').Problem} Problem */

/** Component icons stay under this size (design system §13). */
export const MAX_ICON_BYTES = 4096

/**
 * Checks a component icon against design system §13: a `0 0 24 24` viewBox, vector paths only,
 * with no raster image or script, and under 4 KB.
 * @param {string} svg
 * @param {string} [file]
 * @returns {Problem[]}
 */
export function checkIconRules(svg, file = 'icon.svg') {
  /** @type {Problem[]} */
  const problems = []
  /** @param {string} message */
  const error = message =>
    problems.push({
      level: 'error',
      code: 'E_ICON_RULE',
      file,
      message: `${message} (design system §13)`,
    })
  const bytes = new TextEncoder().encode(svg).length
  if (bytes > MAX_ICON_BYTES)
    error(`The icon is ${(bytes / 1024).toFixed(1)} KB, over 4 KB; simplify its paths`)
  if (!/viewBox\s*=\s*["']\s*0\s+0\s+24\s+24\s*["']/i.test(svg))
    error('A component icon uses the viewBox "0 0 24 24"')
  if (/<image[\s>]|data:image\/|\.(png|jpe?g|gif|webp|bmp)\b/i.test(svg))
    error('The icon holds a raster image; component icons are vector paths only')
  if (/<script[\s>]|\son[a-z]+\s*=/i.test(svg))
    error('The icon holds a script or an event handler; component icons are vector paths only')
  return problems
}

/**
 * Flags each `await` in behaviour code whose operand is not a promise from ctx (eng §10): the
 * kernel resolves ctx's promises in event order, which keeps runs deterministic, and anything
 * else resolves on the real clock. `Promise.all`, `Promise.allSettled` and `Promise.race` of ctx
 * promises are allowed. Awaiting a variable that holds a ctx promise is flagged too; await the call itself.
 * @param {string} source a module as written
 * @param {string} file
 * @returns {Problem[]}
 */
export function checkAwaits(source, file) {
  let tokens
  try {
    tokens = tokenize(source)
  } catch {
    return [] // the bundler reports syntax errors
  }
  /** @type {Problem[]} */
  const problems = []
  for (const [i, t] of tokens.entries()) {
    if (t.type !== 'name' || t.value !== 'await' || tokens[i - 1]?.value === '.') continue
    const [a, b, c] = [tokens[i + 1], tokens[i + 2], tokens[i + 3]]
    const fromCtx = a?.value === 'ctx' && b?.value === '.'
    const combined =
      a?.value === 'Promise' && b?.value === '.' && /^(all(Settled)?|race)$/.test(c?.value ?? '')
    if (fromCtx || combined) continue
    problems.push({
      level: 'error',
      code: 'E_BEHAVIOUR_AWAIT',
      file,
      line: t.line,
      message:
        'This awaits something that is not a ctx promise; behaviour code may await only promises from ctx, which the kernel resolves in simulated time (eng §10)',
    })
  }
  return problems
}
