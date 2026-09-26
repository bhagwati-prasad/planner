import { order } from './log.js'
import { isOdd } from './odd.js'

order.push('even')
export function isEven(n) {
  return n === 0 ? true : isOdd(n - 1)
}
