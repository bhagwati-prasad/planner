# 0008 Store property values in canonical units

Status: Proposed
Date: 2026-09-26

## Context and problem

Eng §8 says values are converted to canonical units at the edges (manifest parsing, UI input, file import) and that nothing in between converts them. The model does the opposite. Property values are stored as the author wrote them: `'4d'`, `'10MB'`, `'30 req/min'`, and percentages in points such as `99.9`. `normalizeValue` then converts them each time they are read, for example by roll-ups (`rollup.js`, which also multiplies percentages by 100 for `product`), the simulation and problem detection.

Task 0108 added the conversions (`core/src/units.js`), and `checkValue` (0107) returns values in canonical units, with percentages as fractions. Nothing stores those values yet. Storing them changes what a saved model and an op log hold, and what commands put in the model, so it needs a decision (CLAUDE.md, "Ask the human first").

## Decision drivers

- Eng §8: one conversion at the edge, and numbers compared and summed without parsing.
- Saved projects (IndexedDB snapshots, `schemaVersion` 1) and op logs must still open and replay (eng §8 migrations, eng §7 command versions).
- The design system's formatter shows values in one consistent style, not in whatever notation an author used.
- Keep the model plain JSON, and keep every model change a command.

## Considered options

1. Store canonical values. Commands that write properties (`component.add`, `node.setProps`, `edge.add`, `edge.setProps`) store the value `checkValue` returns. The registry converts manifest defaults when it normalises a manifest. A snapshot migration, v1 to v2, converts stored values, and readers stop converting.
2. Keep the author's notation and convert on read, as today, and relax eng §8 through this ADR.
3. Store both: the canonical value, plus the text the author wrote, for display.

## Decision outcome

Proposed: option 1, because it is what eng §8 already requires, it removes conversion from every reader, and the formatter can write any canonical value back in the design system's style (`formatQuantity`).

## Consequences

- Good: roll-ups, the simulation and problem detection read numbers directly. `normalizeValue` and the percentage scale factor in roll-ups go away. A value is compared the same way wherever it came from.
- Good: commands still accept the author's notation as input, so existing op logs replay unchanged. Their payloads are converted when they apply, and the command version does not change.
- Bad: the author's notation is not kept. `'1h30m'` shows as `1 h 30 min`, which the formatter produces anyway.
- Bad: saved projects need a snapshot migration, `migrations/v1-to-v2.js`, with fixtures in `test/fixtures/schema-v1/`. Values whose component type is missing (placeholders) stay as written and are reported as problems.
- Bad: component behaviour code (M03 and later) receives milliseconds, bytes and fractions. The plugin API documentation has to say so before its first release.
- Open question: money has no property type yet. `monthlyCost` is a `number` with unit `USD`. A `money` type storing `{ amountMicros, currency }` would change the plugin API, and is a separate decision.
- Follow-up task (to add to M01 after 0108, if accepted): convert on write in the property commands and the registry, and add the snapshot migration and its fixtures. Then remove `normalizeValue` from the readers, and make roll-ups treat percentages as fractions.

## Pros and cons of the options

### Option 1: store canonical values

- Good, because it follows eng §8 as written.
- Good, because readers become simpler and faster.
- Bad, because saved projects need a migration.

### Option 2: keep the author's notation

- Good, because nothing changes and no migration is needed.
- Bad, because every reader keeps converting, and a reader that forgets gets strings where it expects numbers.
- Bad, because it contradicts eng §8, which would have to change.

### Option 3: store both

- Good, because the author's notation is kept exactly.
- Bad, because the two can disagree, every write has to update both, and the model grows.
