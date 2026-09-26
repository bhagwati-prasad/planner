# Test utilities

Shared helpers for tests (eng §18). Import them from `tools/testing/index.js`.

| Helper                                                                           | Use it for                                                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `createFakeClock({ start })`                                                     | Time that moves only when the test moves it: `now()`, `advance(ms)`, `set(ms)`                                            |
| `createFakeScheduler({ clock })`                                                 | `setTimeout`, `setInterval` and their `clear…` in time order with no real waiting: `advance(ms)`, `runNext()`, `runAll()` |
| `createRandom(seed)`                                                             | A seeded PRNG (`uint32()`, `float()`) that gives the same sequence on every engine                                        |
| `gen.int`, `float`, `bool`, `oneOf`, `string`, `array`, `record`, `tuple`, `map` | Generators for property tests; every one shrinks, including composites                                                    |
| `sample(generator, { seed, count })`                                             | A look at what a generator produces                                                                                       |
| `property(generators, predicate, { seed, runs })`                                | Checks a predicate on generated cases; on failure it shrinks the case and throws a `PropertyFailure` naming the seed      |
| `fixtures(import.meta.url)`                                                      | Loads `.strata` fixtures by name from the nearest `test/fixtures` folder                                                  |

```js
import { gen, property } from '../../../tools/testing/index.js'

property([gen.array(gen.int(0, 100))], list => [...list].reverse().reverse().join() === list.join())
```

A failing property prints the seed. Rerun with `STRATA_SEED=<seed> node --test <file>` to replay it; without `STRATA_SEED` the seed is fixed, so runs are reproducible.

## Browser tests

Playwright specs import `test` and `expect` from `tools/testing/playwright.js` instead of `@playwright/test`. `playwright.config.js` runs every spec in Chromium, Firefox and WebKit. The specs in `tests/e2e/` run twice per browser: once from the local server (`scripts/dev-server.js`, the same server as `strata serve`) and once from `file://`. `dist/` is rebuilt first.

| Fixture                                          | Use it for                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                                           | `'served'` or `'file'`, set by the project                                                                                                                                            |
| `urlFor(path)`                                   | A repository path as a URL for the project's mode, such as `urlFor('dist/strata.html')`                                                                                               |
| `mount(tag, { module, attributes, properties })` | Opens the element harness (`browser/harness.html`), loads `module`, and mounts one `tag` element in `#host`. Resolves to its locator, and fails if the module does not define the tag |

Component specs go in `packages/<name>/test/components/*.spec.js`. They need the harness, which loads ES modules, so they run served only.

```js
import { test, expect } from '../../../../tools/testing/playwright.js'

test('counts clicks', async ({ mount }) => {
  const counter = await mount('test-counter', {
    module: '/tools/testing/browser/fixtures/test-counter.js',
  })
  await counter.getByRole('button').click()
  await expect(counter).toHaveText('Count: 1')
})
```

Run one file with `npx playwright test path/to/file.spec.js`. Set `STRATA_BROWSERS=chromium` to limit a local run to the browsers you have installed; CI installs and runs all three.
