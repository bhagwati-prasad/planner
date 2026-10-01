// @ts-check
// The await check of `strata validate` (eng §10, spec §8): behaviour code may await only ctx
// promises, and the combinations of them that the kernel still settles in event order.
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { checkAwaits } from '../src/checks.js'

it('allows Promise.race of ctx promises, as it allows Promise.all and Promise.allSettled', () => {
  const source = `export default {
  public: {
    async go (msg, ctx) {
      const both = await Promise.all([ctx.send('a', 'x'), ctx.send('b', 'y')])
      const first = await Promise.race([ctx.send('out', 'get'), ctx.spend(100)])
      await new Promise(resolve => setTimeout(resolve, 5))
      return [both, first]
    }
  }
}
`
  assert.deepEqual(
    checkAwaits(source, 'index.js').map(p => [p.line, p.code]),
    [[6, 'E_BEHAVIOUR_AWAIT']]
  )
})
