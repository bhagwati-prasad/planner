import { order } from './log.js'
import * as even from './even.js'

order.push('odd')
export function isOdd(n) {
  return n === 0 ? false : even.isEven(n - 1)
}
