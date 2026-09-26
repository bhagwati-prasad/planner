import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { sha256, toHex, toBase64, fromBase64, integrityOf } from '../src/sha256.js'
import { createPrng } from '../../core/src/index.js'

test('sha256 matches the standard test vectors', () => {
  assert.equal(
    toHex(sha256('')),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  )
  assert.equal(
    toHex(sha256('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  )
  assert.equal(
    toHex(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
  )
  assert.equal(
    toHex(sha256('héllo · 世界')),
    createHash('sha256').update('héllo · 世界').digest('hex'),
    'text is hashed as UTF-8'
  )
})

test('sha256 agrees with node:crypto at every padding boundary', () => {
  const random = createPrng(7)
  for (let length = 0; length < 200; length++) {
    const bytes = Uint8Array.from({ length }, () => random.nextU32() & 0xff)
    assert.equal(
      toHex(sha256(bytes)),
      createHash('sha256').update(bytes).digest('hex'),
      `length ${length}`
    )
  }
  const big = new Uint8Array(1_000_000).fill(97)
  assert.equal(
    toHex(sha256(big)),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
  )
})

test('base64 round-trips and integrity strings look like SRI', () => {
  const random = createPrng(3)
  for (let length = 0; length < 40; length++) {
    const bytes = Uint8Array.from({ length }, () => random.nextU32() & 0xff)
    const b64 = toBase64(bytes)
    assert.equal(b64, Buffer.from(bytes).toString('base64'))
    assert.deepEqual(fromBase64(b64), bytes)
  }
  assert.equal(integrityOf('abc'), `sha256-${createHash('sha256').update('abc').digest('base64')}`)
})
