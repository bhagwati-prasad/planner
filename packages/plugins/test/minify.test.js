// @ts-check
// The minifier drops line breaks and spaces only where the program cannot notice: every token
// stays, in order, and a line break stays wherever automatic semicolon insertion or a
// restricted production (return, throw, break, continue, yield, postfix ++ and --) could
// depend on it. Each case runs before and after minifying and must give the same result.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Script, createContext } from 'node:vm'
import { minify } from '../src/minify.js'
import { tokenize } from '../src/tokenize.js'

/** Runs a script body in a fresh context and returns the value of `result`. @param {string} code */
function run(code) {
  const context = createContext({})
  new Script(`'use strict';\n${code}\n;globalThis.__result = result`).runInContext(context)
  return JSON.stringify(context.__result)
}

/** @param {string} code */
const same = code => {
  const out = minify(code)
  assert.equal(run(out), run(code), `minified:\n${out}`)
  assert.deepEqual(
    tokenize(out).map(t => t.value),
    tokenize(code).map(t => t.value),
    'the same tokens in the same order'
  )
  return out
}

describe('minify', () => {
  it('keeps the line breaks that automatic semicolon insertion needs', () => {
    same('let a = 1\nlet b = 2\nconst result = [a, b]')
    same('let a = 1\nlet b = a\n;[a, b] = [b, 3]\nconst result = [a, b]')
    same('let x = 0\nlet y = 5\nx = y\nx++\nconst result = x')
    same('let i = 1\nlet j = 2\ni\n++j\nconst result = [i, j]')
    same('function f() {\n  return\n  42\n}\nconst result = f()')
    same('function g() {\n  for (;;) {\n    break\n  }\n  return 1\n}\nconst result = g()')
    same('function* h() {\n  yield\n  1\n}\nconst result = [...h()]')
    same('let r = 0\nif (r) r = 1\nelse r = 2\nconst result = r')
    same('let s = 0\ntry { s = 1 }\ncatch { s = 2 }\nfinally { s += 10 }\nconst result = s')
  })

  it('removes the line breaks and spaces nothing depends on', () => {
    const out = same(
      'const result = [\n  1,\n  2,\n].map(n =>\n  n * 2\n)\n  .filter(n => n > 2)\n  .join(\n    ", "\n  )'
    )
    assert.equal(out, 'const result=[1,2,].map(n=>n*2).filter(n=>n>2).join(", ")\n')
    assert.equal(minify('if (a) {\n  b()\n}\nelse c()\n'), 'if(a){b()}else c()\n')
  })

  it('keeps the spaces that stop tokens from merging', () => {
    same('let a = 1\nconst result = a + +a - -a')
    same('const result = 1 .toString() + 2 .toFixed(1)')
    same('const re = /ab+/g\nconst result = "abbx".replace(re, "-") in {} || typeof re')
    same('let x = 2\nconst result = x < !--x')
    same('let n = 3\nconst result = n-- > 1')
    same('const t = (s, v) => s.join(v)\nconst result = t`a${1}b` + `${typeof t}`')
  })

  it('keeps comments out and strings, templates and regular expressions intact', () => {
    same('/* block */ const result = "a  b" + `c  ${" d "}` // line\n + /x  y/.source')
  })
})
