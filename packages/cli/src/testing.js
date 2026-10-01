/**
 * `strata/testing`, as component self-tests import it under `strata test-component` and
 * `npm test`: the test context of spec §8's behaviour contract (task 0303), and runComponent,
 * which runs one component in the kernel (ADR 0020).
 */
export { createTestContext, runComponent } from '../../sim/src/index.js'
