// @ts-check
/**
 * Logarithms, exponentials and powers made of IEEE 754 arithmetic alone (+, −, ×, ÷ and exact
 * scaling by 2), so every engine gives the same bits (eng §13). Math.pow, Math.log and Math.exp
 * may differ in the last bit between engines, which would change a run's hash.
 */

const LN2 = 0.6931471805599453

/** The natural logarithm of x > 0, by atanh's series on its mantissa. @param {number} x */
export function ln(x) {
  let m = x
  let e = 0
  while (m >= 2) {
    m /= 2
    e++
  }
  while (m < 1) {
    m *= 2
    e--
  }
  const z = (m - 1) / (m + 1)
  const z2 = z * z
  let term = z
  let sum = 0
  for (let n = 1; n < 64; n += 2) {
    sum += term / n
    term *= z2
  }
  return e * LN2 + 2 * sum
}

/** e to the power y, by Taylor's series on y less a multiple of ln 2. @param {number} y */
export function exp(y) {
  const k = Math.round(y / LN2)
  const r = y - k * LN2
  let term = 1
  let sum = 1
  for (let n = 1; n < 32; n++) {
    term *= r / n
    sum += term
  }
  for (let i = 0; i < k; i++) sum *= 2
  for (let i = 0; i > k; i--) sum /= 2
  return sum
}

/** x to the power s, for x > 0. @param {number} x @param {number} s */
export const pow = (x, s) => (s === 0 ? 1 : exp(s * ln(x)))
