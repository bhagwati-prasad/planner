// @ts-check
// Fixture loader (eng §18): fixtures are .strata files in a package's test/fixtures folder,
// loaded by name. Each load returns a fresh parsed copy.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const EXTENSIONS = ['.strata', '.json']

/**
 * The fixtures folder for a test file: the `fixtures` folder of the nearest enclosing `test`
 * (or `tests`) folder.
 * @param {string} testFile
 */
function fixturesFolder(testFile) {
  for (let dir = dirname(testFile); dir !== dirname(dir); dir = dirname(dir)) {
    if (['test', 'tests'].includes(basename(dir))) return join(dir, 'fixtures')
  }
  throw new Error(`${testFile} is not inside a test/ folder, so it has no fixtures folder`)
}

/**
 * A loader for the fixtures next to a test file.
 * @param {string} importMetaUrl the test file's `import.meta.url`
 * @returns {(name: string) => any} loads a fixture by name (with or without its extension)
 */
export function fixtures(importMetaUrl) {
  const dir = fixturesFolder(fileURLToPath(importMetaUrl))
  return name => {
    const file = [name, ...EXTENSIONS.map(ext => name + ext)]
      .map(n => join(dir, n))
      .find(existsSync)
    if (!file) {
      const available = existsSync(dir)
        ? readdirSync(dir)
            .filter(f => EXTENSIONS.some(ext => f.endsWith(ext)))
            .map(f => f.replace(/\.(strata|json)$/, ''))
        : []
      throw new Error(
        `No fixture '${name}' in ${relative(ROOT, dir)}. Available: ${available.join(', ') || 'none'}.`
      )
    }
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      throw new Error(
        `Fixture '${name}' (${relative(ROOT, file)}) is not valid JSON: ${err.message}`
      )
    }
  }
}
