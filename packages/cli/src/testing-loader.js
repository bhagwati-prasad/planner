/**
 * Registered by `strata test-component` with `node --import` (task 0307): lets a component's
 * self-tests import the behaviour test context of spec §8 as `strata/testing`, wherever the
 * component folder lives.
 */
import { register } from 'node:module'

register('./testing-hooks.js', import.meta.url)
