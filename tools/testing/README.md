# Test utilities

Shared helpers for tests (eng §18). Import them from `tools/testing/index.js`.

| Helper | Use it for |
| --- | --- |
| `createFakeClock({ start })` | Time that moves only when the test moves it: `now()`, `advance(ms)`, `set(ms)` |
| `createFakeScheduler({ clock })` | `setTimeout`, `setInterval` and their `clear…` in time order with no real waiting: `advance(ms)`, `runNext()`, `runAll()` |
| `createRandom(seed)` | A seeded PRNG (`uint32()`, `float()`) that gives the same sequence on every engine |
| `gen.int`, `float`, `bool`, `oneOf`, `string`, `array`, `record`, `tuple`, `map` | Generators for property tests; every one shrinks, including composites |
| `sample(generator, { seed, count })` | A look at what a generator produces |
| `property(generators, predicate, { seed, runs })` | Checks a predicate on generated cases; on failure it shrinks the case and throws a `PropertyFailure` naming the seed |
| `fixtures(import.meta.url)` | Loads `.strata` fixtures by name from the nearest `test/fixtures` folder |

```js
import { gen, property } from '../../../tools/testing/index.js'

property([gen.array(gen.int(0, 100))], list => [...list].reverse().reverse().join() === list.join())
```

A failing property prints the seed. Rerun with `STRATA_SEED=<seed> node --test <file>` to replay it; without `STRATA_SEED` the seed is fixed, so runs are reproducible.
