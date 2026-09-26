// @ts-check
/** @param {unknown} value */
export function isAnswer(value) {
  const answer = 42
  return value === answer
}

/** @param {unknown} value */
export function isMissing(value) {
  return value == null
}
