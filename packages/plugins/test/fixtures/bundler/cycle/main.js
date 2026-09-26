import { order } from './log.js'
import { isEven } from './even.js'
import * as odd from './odd.js'

order.push('main')
export const results = [isEven(10), isEven(7), odd.isOdd(3), odd.isOdd(0)]
export { order }
