// @ts-check
/**
 * Deterministic natural logarithm and exponential (eng §13 "Cross-engine determinism"): ports
 * of fdlibm's e_log.c and e_exp.c as V8 carries them (FreeBSD msun), built only from IEEE 754
 * arithmetic, which every engine rounds alike, and from the bits of doubles. `Math.log` and
 * `Math.exp` may differ in the last bit between engines; these never do.
 */

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)
/** Where a double's high word sits: second on little-endian hosts. */
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0
const LO = 1 - HI

/** The high word of a double, sign bit included, as a signed integer. @param {number} x */
function high(x) {
  f64[0] = x
  return u32[HI] | 0
}

/** The low word of a double. @param {number} x */
function low(x) {
  f64[0] = x
  return u32[LO]
}

/** The double with these words. @param {number} hi @param {number} lo */
function words(hi, lo) {
  u32[HI] = hi
  u32[LO] = lo
  return f64[0]
}

const LN2_HI = 6.9314718036912381649e-1 // 3fe62e42 fee00000
const LN2_LO = 1.90821492927058770002e-10 // 3dea39ef 35793c76
const TWO54 = 1.8014398509481984e16
const LG1 = 6.66666666666673513e-1
const LG2 = 3.999999999940941908e-1
const LG3 = 2.857142874366239149e-1
const LG4 = 2.222219843214978396e-1
const LG5 = 1.818357216161805012e-1
const LG6 = 1.531383769920937332e-1
const LG7 = 1.479819860511658591e-1

/**
 * The natural logarithm, identical in every engine (fdlibm `__ieee754_log`).
 * @param {number} x
 */
export function log(x) {
  let hx = high(x)
  let k = 0
  if (hx < 0x00100000) {
    // x < 2^-1022: zero, negative or subnormal
    if (((hx & 0x7fffffff) | low(x)) === 0) return -Infinity
    if (hx < 0) return NaN
    k -= 54
    x *= TWO54
    hx = high(x)
  }
  if (hx >= 0x7ff00000) return x + x
  k += (hx >> 20) - 1023
  hx &= 0x000fffff
  const i = (hx + 0x95f64) & 0x100000
  x = words(hx | (i ^ 0x3ff00000), low(x)) // x or x/2, normalised into [sqrt(2)/2, sqrt(2))
  k += i >> 20
  const f = x - 1
  const dk = k
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO
    const r = f * f * (0.5 - 0.33333333333333333 * f)
    return k === 0 ? f - r : dk * LN2_HI - (r - dk * LN2_LO - f)
  }
  const s = f / (2 + f)
  const z = s * s
  const w = z * z
  const t1 = w * (LG2 + w * (LG4 + w * LG6))
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
  const r = t2 + t1
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {
    const hfsq = 0.5 * f * f
    return k === 0
      ? f - (hfsq - s * (hfsq + r))
      : dk * LN2_HI - (hfsq - (s * (hfsq + r) + dk * LN2_LO) - f)
  }
  return k === 0 ? f - s * (f - r) : dk * LN2_HI - (s * (f - r) - dk * LN2_LO - f)
}

const O_THRESHOLD = 7.09782712893383973096e2 // 40862e42 fefa39ef
const U_THRESHOLD = -7.4513321910194110842e2 // c0874910 d52d3051
const INV_LN2 = 1.442695040888963387
const P1 = 1.66666666666666019037e-1
const P2 = -2.77777777770155933842e-3
const P3 = 6.61375632143793436117e-5
const P4 = -1.6533902205465251539e-6
const P5 = 4.13813679705723846039e-8
const TWO_M1000 = 9.3326361850321887899e-302 // 2^-1000
const TWO_1023 = 8.988465674311579539e307
const E = 2.718281828459045

/**
 * The exponential, identical in every engine (fdlibm `__ieee754_exp`, with V8's exact `exp(1)`).
 * @param {number} x
 */
export function exp(x) {
  let hx = high(x)
  const negative = hx < 0
  hx &= 0x7fffffff
  let hi = 0
  let lo = 0
  let k = 0
  if (hx >= 0x40862e42) {
    // |x| >= 709.78...
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | low(x)) !== 0) return x + x // NaN
      return negative ? 0 : x
    }
    if (x > O_THRESHOLD) return Infinity
    if (x < U_THRESHOLD) return 0
  }
  if (hx > 0x3fd62e42) {
    // |x| > ln2 / 2: reduce x to hi - lo, with x = k ln2 + (hi - lo)
    if (hx < 0x3ff0a2b2) {
      // and |x| < 1.5 ln2
      if (x === 1) return E
      hi = negative ? x + LN2_HI : x - LN2_HI
      lo = negative ? -LN2_LO : LN2_LO
      k = negative ? -1 : 1
    } else {
      k = (INV_LN2 * x + (negative ? -0.5 : 0.5)) | 0
      hi = x - k * LN2_HI // exact
      lo = k * LN2_LO
    }
    x = hi - lo
  } else if (hx < 0x3e300000) {
    // |x| < 2^-28
    return 1 + x
  }
  const t = x * x
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
  if (k === 0) return 1 - ((x * c) / (c - 2) - x)
  const y = 1 - (lo - (x * c) / (2 - c) - hi)
  if (k >= -1021) {
    if (k === 1024) return y * 2 * TWO_1023
    return y * words(0x3ff00000 + (k << 20), 0)
  }
  return y * words(0x3ff00000 + ((k + 1000) << 20), 0) * TWO_M1000
}
