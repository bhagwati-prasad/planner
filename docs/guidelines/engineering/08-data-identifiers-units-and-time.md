# 8. Data, identifiers, units and time

## Identifiers

- Entity ids are ULIDs from the injected id generator, monotonic within a millisecond.
- Ids carry no meaning. Human-readable keys such as `PAY-42` or `ADR-003` are separate fields and may change.

## Canonical internal units

Values are converted to canonical units at the edges (manifest parsing, UI input, file import) and back only for display. Nothing in between converts units.

| Quantity | Internal unit | Notes |
| --- | --- | --- |
| Timestamps | Epoch milliseconds, UTC integer | Displayed through `Intl` |
| Durations in properties | Milliseconds | Distributions sample in milliseconds |
| Simulated time | Integer microseconds | Never floating point in the kernel |
| Sizes | Bytes | Display uses decimal units (1 KB = 1,000 B) |
| Rates | Per second | `req/s`, `msg/s` |
| Bandwidth | Bits per second | Displayed as `Mbps` or `Gbps` |
| Percentages | Fractions from 0 to 1 | Displayed as % |
| Money | Integer micro-units plus ISO 4217 currency code | `{ amountMicros: 1250000, currency: 'USD' }` |

## Schemas and serialisation

- Manifests, `.strata` files and worker messages are validated with the in-house schema validator in `core`, not a library.
- Writers sort object keys, so exported files are stable and diff cleanly.
- Every persisted format has an integer `schemaVersion`.
- Migrations are pure functions in `migrations/vN-to-vN+1.js`, tested against fixtures in `test/fixtures/schema-vN/`. A released migration is never edited or deleted.

---
Part of the [Strata Engineering Guidelines](README.md).
