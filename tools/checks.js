#!/usr/bin/env node
// @ts-check
// Formatting, lint and type-check commands (eng §4, §5, §16), behind the npm scripts:
//
//   node tools/checks.js format | format:check | lint | typecheck [paths...]
//
// Without paths they cover the repository. With paths they cover just those files, including
// files the repository-wide runs ignore, such as the failing fixtures in tools/test/fixtures/.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BIN = {
  prettier: join(ROOT, 'node_modules/prettier/bin/prettier.cjs'),
  eslint: join(ROOT, 'node_modules/eslint/bin/eslint.js'),
  tsc: join(ROOT, 'node_modules/typescript/bin/tsc'),
}

/**
 * Runs a tool from node_modules in the repository root.
 * @param {string} bin
 * @param {string[]} args
 * @returns {number} exit status
 */
function run(bin, args) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: ROOT, stdio: 'inherit' })
  return result.status ?? 1
}

/**
 * Type-checks the given files with the repository's compiler options, or the whole project.
 * @param {string[]} paths
 */
function typecheck(paths) {
  if (!paths.length) return run(BIN.tsc, ['-p', join(ROOT, 'jsconfig.json'), '--noEmit'])
  const dir = mkdtempSync(join(tmpdir(), 'strata-typecheck-'))
  try {
    const config = {
      extends: join(ROOT, 'jsconfig.json'),
      compilerOptions: { noEmit: true },
      include: [],
      files: paths.map(path => resolve(ROOT, path)),
    }
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config))
    return run(BIN.tsc, ['-p', join(dir, 'tsconfig.json')])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** @type {Record<string, (paths: string[]) => number>} */
const COMMANDS = {
  // With explicit paths, only .gitignore applies, so fixtures can be checked on purpose.
  format: paths =>
    run(BIN.prettier, [
      '--write',
      ...(paths.length ? ['--ignore-path', '.gitignore', ...paths] : ['.']),
    ]),
  'format:check': paths =>
    run(BIN.prettier, [
      '--check',
      ...(paths.length ? ['--ignore-path', '.gitignore', ...paths] : ['.']),
    ]),
  lint: paths => run(BIN.eslint, paths.length ? ['--no-ignore', ...paths] : ['.']),
  typecheck,
}

const [command, ...paths] = process.argv.slice(2)
const handler = COMMANDS[command]
if (!handler) {
  console.error(`Usage: node tools/checks.js ${Object.keys(COMMANDS).join(' | ')} [paths...]`)
  process.exit(2)
}
process.exit(handler(paths))
