// @ts-check
// The vendored Three.js (task 0006), bundled by our build into a classic script, exposes THREE
// from file:// and from the local server in every browser.
import { test, expect } from '../../tools/testing/playwright.js'

test('the Three.js IIFE exposes THREE', async ({ page, mode, urlFor }) => {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await page.goto(urlFor('tests/e2e/fixtures/three.html'))
  const three = await page.evaluate(() => {
    const THREE = /** @type {any} */ (window).THREE
    if (!THREE) return null
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())
    const scene = new THREE.Scene().add(box)
    box.geometry.computeBoundingBox()
    return {
      protocol: location.protocol,
      revision: THREE.REVISION,
      children: scene.children.length,
      size: box.geometry.boundingBox.getSize(new THREE.Vector3()).toArray(),
      renderer: typeof THREE.WebGLRenderer,
    }
  })
  expect(three).toEqual({
    protocol: mode === 'file' ? 'file:' : 'http:',
    revision: '186',
    children: 1,
    size: [2, 2, 2],
    renderer: 'function',
  })
  expect(errors).toEqual([])
})
