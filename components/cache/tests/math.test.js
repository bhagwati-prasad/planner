// @ts-check
// Powers for access skew (eng §13): made of IEEE 754 arithmetic alone, so every engine gives the
// same bits, where Math.pow, Math.log and Math.exp may differ in the last bit between engines.
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { exp, ln, pow } from '../math.js'

it('computes logarithms, exponentials and powers to within 1e-13 of Math', () => {
  for (const x of [1, 1.5, 2, 3, 10, 123.456, 1e7, 0.25])
    assert.ok(
      Math.abs(ln(x) - Math.log(x)) <= 1e-13 * Math.max(1, Math.abs(Math.log(x))),
      `ln ${x}`
    )
  for (const y of [0, 0.5, -1, 2.302585, -12.5, 20])
    assert.ok(Math.abs(exp(y) / Math.exp(y) - 1) <= 1e-13, `exp ${y}`)
  for (const [x, s] of [
    [2, 0.8],
    [7, 1.5],
    [1000, 1.2],
    [3, 0],
  ])
    assert.ok(Math.abs(pow(x, s) / x ** s - 1) <= 1e-13, `pow ${x} ${s}`)
})
