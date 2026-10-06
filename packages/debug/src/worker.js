// @ts-check
/**
 * The simulation worker's entry (eng §13, ADR 0024): strata-sim's worker, with the debugger's
 * run controls and reads. strata-debug is the top package in the worker, so the worker starts
 * here. The build bundles it into dist/sim-worker.js.
 */
import { startWorker } from '../../sim/src/index.js'
import { debugExtensions } from './session.js'

startWorker(globalThis, { extensions: debugExtensions })
