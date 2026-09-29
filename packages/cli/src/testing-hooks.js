/**
 * Module resolution hooks for `strata test-component` (see testing-loader.js): `strata/testing`
 * is testing.js, whose createTestContext gives self-tests a ctx without the kernel.
 */
const TESTING = new URL('./testing.js', import.meta.url).href

/**
 * @param {string} specifier
 * @param {object} context
 * @param {(specifier: string, context: object) => Promise<object>} next
 */
export async function resolve(specifier, context, next) {
  if (specifier === 'strata/testing') return { url: TESTING, shortCircuit: true }
  return next(specifier, context)
}
