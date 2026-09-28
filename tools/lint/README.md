# strata lint rules

An in-house ESLint plugin for the rules the engineering guidelines mark **(lint)**, starting with the non-negotiables of eng §2. It has no dependencies beyond ESLint itself and is wired up in `eslint.config.js`.

| Rule | Guideline | What it enforces | Where |
| --- | --- | --- | --- |
| `strata/import-boundaries` | eng §4, §6 | A package imports only the packages the eng §6 table allows, only through their `src/index.js`, and no npm packages (`d3` in graph, `three` in 3d, `node:` built-ins in cli and server) | `packages/*/src` |
| `strata/banned-globals` | eng §2, §6 | No `window`, `document`, `navigator`, storage, `fetch`, `XMLHttpRequest`, timers, `Date.now`, `new Date()`, `performance.now`, `Math.random` or `console` in the packages eng §6 lists | `packages/*/src` of those packages |
| `strata/no-dynamic-html` | eng §11 | `innerHTML`, `outerHTML` and `insertAdjacentHTML` take only static strings or a `sanitize…()` result | everywhere |
| `strata/no-colour-literals` | eng §11 | Component CSS uses `var(--st-…)` tokens; hex, `rgb()`-style and named colours are rejected. Custom property definitions (the tokens themselves) may hold raw values | `.css` files and `static css` fields in `packages/ui` and `components/` |
| `strata/no-floating-promises` | eng §14 | Promises are awaited, returned, given a rejection handler, or marked fire-and-forget with `void` | everywhere |
| `strata/no-only` | CLAUDE.md | No `it.only`, `test.only`, `describe.only` or `{ only: true }` | everywhere |
| `strata/facade-help` | eng §20 | Public facade methods have help metadata: a JSDoc summary, `@param` tags (the signature) and an `@example` | `packages/facade/src` |

ESLint's own rules cover the rest of the lint-marked rules: `no-eval`, `no-new-func` and `no-implied-eval` everywhere except the sandbox worker bootstrap (`packages/sim/src/worker/bootstrap.js`, eng §16), and `no-console` in library code (every package except cli, eng §14).

The dependency table and the banned globals are read from `docs/guidelines/engineering/06-architecture-and-dependency-rules.md` by `guidelines.js`, so changing the guideline (through an ADR) changes the check. `scripts/check-boundaries.js` reads the same table.

## Limits

- **Floating promises** are found without type information, so the rule is a heuristic. It flags an expression statement that calls an `async` function or `async` method declared in the same file (including `this.#method()`), calls `.then()` with a single argument and nothing after it, or constructs a `Promise`. It misses promises from functions declared in other modules or returned by the platform (`fetch()`, `blob.arrayBuffer()`), promises stored in variables and never awaited, and `.finally()` chains without a `.catch()`. Review still covers those.
- **Colour literals** are checked in `.css` files and in `static css` class fields. CSS built in other strings (a `const` of CSS text) is not checked.
- **Import boundaries** apply to `src/`. Tests may import across packages to reuse fixtures.
- **Help metadata** reads JSDoc; `tools/help/generate.js` turns the same JSDoc into the runtime `strata.help()` catalogue (0120).

## Existing code

Rules adopted after code was written start with a bulk suppression (`eslint-suppressions.json`, ESLint's own mechanism) instead of scattered disable comments. Each entry counts the known violations of one rule in one file, and is owned by the task that removes it.

The file is empty now: task 0120 removed the last entry, the facade methods that had no help metadata (`strata/facade-help`). A suppressed file still fails on any violation beyond its recorded count, and ESLint reports suppressions that no longer occur, so the list only shrinks: run `npx eslint . --prune-suppressions` after fixing some. `tools/lint/test/config.test.js` keeps the file empty; a task that adopts a rule over existing code changes that test to name itself as the owner.

## Tests

`node --test tools/lint/test/rules.test.js` runs every rule's valid and invalid cases through ESLint's RuleTester; `config.test.js` checks the rules as `eslint.config.js` applies them.
