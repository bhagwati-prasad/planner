#!/usr/bin/env node
// @ts-check
// `npm run check`: every gate CI runs (eng §19), in order, stopping at the first failure. CI
// runs this same script, so a green local check means a green pipeline.
//
//   node tools/ci/check.js
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const node = process.execPath

/**
 * @typedef {object} Step
 * @property {string} name
 * @property {string} title
 * @property {string[][]} commands  each is [executable, ...args], run from the repository root
 */

/** @type {ReadonlyArray<Step>} */
export const STEPS = Object.freeze([
  { name: 'format', title: 'Formatting', commands: [[node, 'tools/checks.js', 'format:check']] },
  {
    name: 'lint',
    title: 'Lint and import boundaries',
    commands: [
      [node, 'tools/checks.js', 'lint'],
      [node, 'scripts/check-boundaries.js'],
    ],
  },
  { name: 'typecheck', title: 'Type-check', commands: [[node, 'tools/checks.js', 'typecheck']] },
  { name: 'unit', title: 'Node tests', commands: [[node, 'scripts/run-tests.js']] },
  { name: 'build', title: 'Build', commands: [[node, 'scripts/build.js']] },
  { name: 'browser', title: 'Browser tests', commands: [[node, 'scripts/run-browser-tests.js']] },
  { name: 'size', title: 'Bundle size', commands: [[node, 'tools/ci/size.js']] },
  { name: 'licence', title: 'Licences', commands: [[node, 'tools/ci/licence.js']] },
])

/**
 * Runs one gate's commands in turn with inherited output.
 * @param {Step} step
 * @returns {number} the exit code of the first command that fails, or 0
 */
function spawnStep(step) {
  for (const [command, ...args] of step.commands) {
    const { status, error } = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' })
    if (error) throw error
    if (status !== 0) return status ?? 1
  }
  return 0
}

/**
 * Runs the gates in order and stops at the first that fails.
 * @param {object} [options]
 * @param {ReadonlyArray<Step>} [options.steps]
 * @param {(step: Step) => number | Promise<number>} [options.run]  runs one gate, returns its exit code
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<number>} 0 when every gate passes, otherwise the failing gate's exit code
 */
export async function runCheck({ steps = STEPS, run = spawnStep, log = console.log } = {}) {
  for (const [i, step] of steps.entries()) {
    log(`\n[${i + 1}/${steps.length}] ${step.title}`)
    const code = await run(step)
    if (code !== 0) {
      log(`\ncheck failed at ${step.name} (exit code ${code})`)
      return code
    }
  }
  log(`\ncheck passed: ${steps.map(s => s.name).join(', ')}`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runCheck()
