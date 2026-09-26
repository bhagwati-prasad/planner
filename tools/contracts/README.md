# Adapter contracts

Every adapter interface (`packages/core/src/types.js`, eng §6) has a contract suite here. Every implementation, real or fake, must pass it (eng §18). Each suite is a function that registers `node:test` cases for one implementation, so the same checks run against all of them.

| Contract | Interface | Checks |
| --- | --- | --- |
| `clock.contract.js` | `() => epoch ms` | Integer milliseconds; never goes backwards |
| `scheduler.contract.js` | `setTimeout`, `clearTimeout` | Timers run in due order; cleared timers never run |
| `prng.contract.js` | `nextU32`, `next`, `bytes` | Same seed, same stream; values in range |
| `ids.contract.js` | `() => ULID` | Crockford base32, unique, in creation order |
| `logger.contract.js` | `debug`, `info`, `warn`, `error` | Every level accepted, and kept apart |

`test/adapters.test.js` runs them against:
- the browser's real adapters (`app/adapters.js`);
- Node's real adapters (`packages/cli/src/adapters.js`);
- the core's `createPrng` and `createUlidFactory`;
- the fakes in `tools/testing`.

The real scheduler is the one place a test waits on real timers, since that is what its contract is about. It waits on a timer of its own, a few milliseconds long.
