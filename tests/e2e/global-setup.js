// @ts-check
// Builds dist/ once before the browser tests, so the smoke tests open the current code. It also
// makes dist/loaders.html, the offline app with two test components added by
// `strata pack --install`, for tests/e2e/loaders.spec.js.
import { copyFile, mkdir } from 'node:fs/promises'
import { build } from '../../scripts/build.js'
import { main as strata } from '../../packages/cli/src/index.js'

export default async function globalSetup() {
  await build({ log: () => {} })
  await copyFile('dist/strata.html', 'dist/loaders.html')
  await mkdir('dist/e2e', { recursive: true })
  let errors = ''
  const io = {
    cwd: process.cwd(),
    stdout: { write() {} },
    stderr: { write: (/** @type {string} */ t) => void (errors += t) },
  }
  for (const name of ['alpha', 'beta']) {
    const args = [
      'pack',
      `tests/e2e/fixtures/components/${name}`,
      '--out',
      `dist/e2e/${name}.strata.js`,
      '--install',
      'dist/loaders.html',
    ]
    if ((await strata(args, io)) !== 0)
      throw new Error(`strata pack failed for ${name}:\n${errors}`)
  }
}
