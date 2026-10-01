// strata/testing (tasks 0307, 0409): what component self-tests import under strata test-component
// and npm test: createTestContext for one method at a time, and runComponent for a component in
// the kernel (ADR 0020).
import { it } from 'node:test'
import assert from 'node:assert/strict'
import * as testing from '../src/testing.js'

it('offers createTestContext and runComponent', () => {
  assert.deepEqual(Object.keys(testing).sort(), ['createTestContext', 'runComponent'])
  assert.equal(typeof testing.runComponent, 'function')
})
