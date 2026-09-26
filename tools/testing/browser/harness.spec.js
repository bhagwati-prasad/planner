// @ts-check
// The element harness (task 0007): component tests mount one custom element in isolation.
import { test, expect } from '../playwright.js'

const COUNTER = '/tools/testing/browser/fixtures/test-counter.js'

test('mounts one custom element with its attributes and properties', async ({ mount, page }) => {
  const counter = await mount('test-counter', {
    module: COUNTER,
    attributes: { label: 'Clicks' },
    properties: { count: 2 },
  })
  await expect(counter).toHaveText('Clicks: 2')
  await counter.getByRole('button').click()
  await expect(counter).toHaveText('Clicks: 3')
  await expect(page.locator('#host > *')).toHaveCount(1)
})

test('fails clearly when the module does not define the element', async ({ mount }) => {
  await expect(mount('test-missing', { module: COUNTER })).rejects.toThrow(
    /test-missing is not defined by \/tools\/testing\/browser\/fixtures\/test-counter\.js/
  )
})
