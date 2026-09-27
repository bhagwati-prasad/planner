# Shared fixtures

Models that tests across packages build through commands, so every package tests against the same data.

| Builder | What it builds |
| --- | --- |
| `recursive-payments.js` | The recursive fixture of eng §9: the payments example of spec §7, three levels deep, with one inner system placed by reference (read-only), one placed by value, and one component opened as a system that keeps its own properties. Every public method of every composite is bound all the way down, and the model has no problems. |

```js
import { createCore, createRegistry } from '../../packages/core/src/index.js'
import { registerFixtureTypes, buildRecursivePayments } from '../../tools/fixtures/recursive-payments.js'

const registry = createRegistry()
registerFixtureTypes(registry)
const core = createCore({ clock, random, registry })
const ids = buildRecursivePayments(core) // ids.payments, ids.ledger, ids.fraud, ids.authPath, ...
```

The same seed builds the same model, ids included. `packages/core/test/fixture.test.js` checks that it passes validation and covers every case eng §9 lists. M06 adds a `.strata` export of it.
