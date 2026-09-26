import { greet } from './lib/greet.js'
import shout from './lib/shout.js'

export const message = shout(greet('Strata'))
export { greet }
