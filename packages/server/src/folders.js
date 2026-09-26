/**
 * Node-side plugin tooling shared by the local server and the CLI: reading a component folder
 * from disk, packing it with the same packer the browser uses, and a real syntax check of
 * every module (the packer's tokenizer catches structure, V8 catches the rest).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep, basename } from 'node:path'
import { Script } from 'node:vm'
import { packComponent } from '../../plugins/src/index.js'

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn'])
const MAX_FILE_BYTES = 8 * 1024 * 1024

/**
 * Reads every file under `dir` (except version-control and dependency folders).
 * @param {string} dir
 * @returns {Promise<Record<string, Uint8Array>>} POSIX path relative to `dir` → bytes
 */
export async function readFolder(dir) {
  /** @type {Record<string, Uint8Array>} */
  const out = {}
  const walk = async current => {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path)
      } else if (entry.isFile()) {
        if ((await stat(path)).size > MAX_FILE_BYTES) continue
        out[relative(dir, path).split(sep).join('/')] = new Uint8Array(await readFile(path))
      }
    }
  }
  await walk(dir)
  return out
}

/**
 * Compiles each wrapped module with V8 (without running it) and reports syntax errors with
 * the author's line numbers.
 * @param {Record<string, string>} modules  path → wrapped source
 * @returns {import('../../plugins/src/index.js').Problem[]}
 */
export function syntaxProblems(modules) {
  const problems = []
  for (const [path, code] of Object.entries(modules)) {
    try {
      new Script(`(${code})`, { filename: path })
    } catch (err) {
      const line = /:(\d+)\n/.exec(String(err.stack))?.[1]
      problems.push({
        level: /** @type {'error'} */ ('error'),
        file: path,
        line: line ? Number(line) : undefined,
        message: `${err.name}: ${err.message}`,
      })
    }
  }
  return problems
}

/**
 * Reads, packs and syntax-checks a component folder.
 * @param {string} dir
 * @returns {Promise<import('../../plugins/src/index.js').PackResult>}
 */
export async function packFolder(dir) {
  const files = await readFolder(dir)
  const result = packComponent(files, { name: basename(dir) })
  if (!result.bundle) return result
  const syntax = syntaxProblems(result.bundle.modules)
  if (syntax.length)
    return { bundle: null, script: null, fileName: null, problems: [...result.problems, ...syntax] }
  return result
}

/**
 * The component folders directly inside `dir` (those with a manifest.json).
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function componentFolders(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const folders = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    try {
      if ((await stat(join(dir, entry.name, 'manifest.json'))).isFile())
        folders.push(join(dir, entry.name))
    } catch {}
  }
  return folders
}
