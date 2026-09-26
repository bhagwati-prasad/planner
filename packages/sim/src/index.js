// @ts-check
/**
 * strata-sim: discrete-event simulation kernel, method dispatch, scopes and stubs, snapshots, the run tree, chaos and metrics.
 * Runs in: Web Worker, `worker_threads`. Specified in spec §11, §12; built in M04 (tasks 0401–0417).
 * This is the package's only public entry point (eng §4).
 */
export { ENGINE_VERSION, Kernel } from './kernel.js'
export { EventQueue } from './queue.js'
export { createStreams, xoshiro128ss, hashKey } from './random.js'
export { runHash } from './hash.js'
export { simulate } from './skeleton.js'
export { PROTOCOL_VERSION, handleMessage } from './protocol.js'
