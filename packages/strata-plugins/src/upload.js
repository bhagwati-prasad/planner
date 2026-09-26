/**
 * The upload path (spec §7 "Loading paths"): a dropped `.strata.js`, a zip of a component
 * folder, or the files of a folder become a verified bundle, using the same packer as
 * `strata pack`.
 */
import { StrataError } from '../../strata-core/src/index.js'
import { packComponent, readBundle, asText, componentScript } from './pack.js'
import { readZip, isZip } from './zip.js'

/**
 * @param {{ path: string, content: string|Uint8Array }[]} uploads
 * @param {{ inflateRaw?: import('./zip.js').InflateRaw }} [options]
 * @returns {Promise<import('./pack.js').PackResult>}
 */
export async function packUpload (uploads, options = {}) {
  const base = path => path.replace(/\\/g, '/').split('/').pop() ?? path
  const failure = (file, err) => {
    if (!(err instanceof StrataError)) throw err
    return { bundle: null, script: null, fileName: null, problems: [{ level: /** @type {'error'} */ ('error'), file, message: err.message }] }
  }
  if (!uploads.length) return failure('upload', new StrataError('INVALID', 'Nothing was uploaded'))

  if (uploads.length === 1) {
    const [{ path, content }] = uploads
    if (path.endsWith('.strata.js')) {
      const text = asText(content)
      try {
        const bundle = readBundle(text ?? '')
        return { bundle, script: componentScript(bundle, base(path)), fileName: base(path), problems: [] }
      } catch (err) {
        return failure(path, err)
      }
    }
    const bytes = typeof content === 'string' ? null : content
    if (path.endsWith('.zip') || (bytes && isZip(bytes))) {
      if (!bytes) return failure(path, new StrataError('INVALID', 'The zip file was read as text; upload it as bytes'))
      let files
      try {
        files = await readZip(bytes, options)
      } catch (err) {
        return failure(path, err)
      }
      return packComponent(files, { name: base(path).replace(/\.zip$/i, '') })
    }
  }

  // The files of a folder: paths like 'message-queue/manifest.json'.
  const files = Object.fromEntries(uploads.map(u => [u.path, u.content]))
  const tops = new Set(uploads.map(u => u.path.replace(/\\/g, '/').split('/')[0]))
  const name = tops.size === 1 && uploads.every(u => u.path.includes('/')) ? [...tops][0] : undefined
  return packComponent(files, { name })
}
