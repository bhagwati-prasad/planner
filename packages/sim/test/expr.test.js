// @ts-check
// Expressions (ADR 0019): the safe language of `when` routing rules, read by an in-house parser
// rather than eval, so it works under the strict CSP and inside the sandbox.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compile } from '../src/expr.js'

const msg = {
  method: 'placeOrder',
  path: '/orders/42',
  headers: { 'x-canary': '1' },
  body: { total: 1500, items: ['a', 'b'], customer: { tier: 'gold' }, note: null },
}

/** @param {string} text */
const run = text => compile(text, ['msg'])({ msg })

describe('expressions', () => {
  it('evaluates literals, member access, comparisons, logic and parentheses', () => {
    assert.equal(run('msg.body.total > 1000'), true)
    assert.equal(run('msg.body.total <= 1000'), false)
    assert.equal(run("msg.headers['x-canary'] == '1'"), true)
    assert.equal(run('msg.body.customer.tier === "gold" && !(msg.body.total < 100)'), true)
    assert.equal(run("msg.method != 'placeOrder' || msg.body.items[1] == 'b'"), true)
    assert.equal(run('msg.body.items.length >= 2'), true)
    assert.equal(run('msg.body.note == null && true'), true)
    assert.equal(run("msg.path < 'z' && -1.5 < 0"), true)
    assert.equal(run('1 == "1"'), false, '== does not convert types')
    assert.equal(run('msg.body.total > "1000"'), false, 'numbers and text do not compare')
  })

  it('reads only what the message holds, and a missing member is undefined', () => {
    assert.equal(run('msg.body.missing.deeper'), undefined)
    assert.equal(run('msg.constructor'), undefined)
    assert.equal(run("msg['__proto__']"), undefined)
    assert.equal(run('msg.body.items.map'), undefined)
    assert.equal(run('msg.path.length'), 10)
  })

  it('refuses malformed expressions and unknown names with E_SIM_EXPRESSION_INVALID', () => {
    for (const text of [
      'msg.body.total >',
      'msg.body.(total)',
      '(msg.body.total > 1',
      "msg.headers['x",
      'msg.body.total = 5',
      'globalThis.process',
      'msg.body.total > 1 msg',
      '',
    ])
      assert.throws(
        () => compile(text, ['msg']),
        /** @param {any} err */ err => err.code === 'E_SIM_EXPRESSION_INVALID',
        JSON.stringify(text)
      )
  })
})
