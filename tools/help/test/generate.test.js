import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractHelp, generateHelp, OUTPUT } from '../generate.js'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

describe('help metadata generator', () => {
  it('the help metadata is generated from the JSDoc in packages/facade/src', async () => {
    const generated = readFileSync(join(ROOT, OUTPUT), 'utf8')
    assert.equal(generated, await generateHelp(ROOT), 'run npm run generate:help')
  })

  it('reads signatures, summaries and examples from exported classes only', () => {
    const help = extractHelp(`
class Hidden {
  /** Not exported. @example x.a() */
  a() {}
}
export class Shown {
  /** The name. More detail, e.g. this. */
  get name() {}
  /**
   * Adds a thing. Its options come from the parameter's type when the destructuring has a rest.
   * @param {string} type
   * @param {{ name?: string, at?: { x: number, y: number }, id?: string }} [options]
   * @example
   * const t = s.add('service')
   * t.name
   */
  add(type, { at, ...fields } = {}) {}
  /** Binds a method. @param {string} method @param {string} [target] @example s.bind('a') */
  bind(method, target = method, ...more) {}
  /** Plumbing. @internal */
  sync() {}
  /** Also plumbing. @example s._detach() */
  _detach() {}
  #secret() {}
}`)
    assert.deepEqual(help, {
      Shown: [
        ['name', null, 'The name'],
        ['add', 'type, { name, at, id }', 'Adds a thing', "const t = s.add('service')\nt.name"],
        ['bind', 'method, target = method, ...more', 'Binds a method', "s.bind('a')"],
      ],
    })
  })
})
