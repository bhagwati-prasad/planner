/**
 * `strata repl`: the console API (spec §16) in a Node session, with the packed components
 * from the given directories installed.
 */
import { start } from 'node:repl'
import { relative } from 'node:path'
import { createStrata } from '../../facade/src/index.js'
import { componentFolders, packFolder } from '../../server/src/index.js'

/** @param {{ dirs: string[] }} options */
export async function startRepl ({ dirs }) {
  const strata = createStrata()
  let installed = 0
  for (const dir of dirs) {
    for (const folder of await componentFolders(dir)) {
      const result = await packFolder(folder)
      if (result.bundle) {
        strata.components.install(result.bundle)
        installed++
      } else console.warn(`Skipped ${relative(process.cwd(), folder)}: it has errors (run strata validate on it)`)
    }
  }
  console.log(`Strata console. ${installed} component${installed === 1 ? '' : 's'} installed. Try strata.help().`)
  const session = start({ prompt: 'strata> ', useGlobal: false })
  session.context.strata = strata
  await new Promise(resolve => session.on('exit', resolve))
}
