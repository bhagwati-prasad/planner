# Working on Strata

## The spec

The specification is a Claude Docs document, not a file in this repo: "Strata — Architecture & Spec Planner: Product and Technical Specification", doc id `0c742d83-dac0-4db4-8367-aec636b81bd9` (https://claude.ai/code/artifact/0c742d83-dac0-4db4-8367-aec636b81bd9). Read it with the Claude Docs connector. Section numbers (§4, §6, ...) in code comments refer to it. `docs/implementation-notes.md` records what is built and every decision taken where the spec was silent; update it when you add to that list.

## Commands

- `npm test`: every `packages/*/test/**/*.test.js`, via `node:test`. Pass a substring to filter (`npm test -- recursion`).
- `npm run check`: architecture boundary check (dependency direction, no DOM or Node built-ins in headless packages).
- `npm run verify`: both. Run it before every commit.
- `npm run demo`: the spec's console session, headless.
- `npm run typecheck`: JSDoc type check with `tsc --checkJs` (fetches TypeScript through npx; it is a dev tool, not a dependency).

## Rules

- JavaScript ES modules with JSDoc types. No TypeScript, no framework, no npm runtime dependencies. Node 20+.
- Packages import each other by relative path (`../../strata-core/src/index.js`) so the same files load in Node, in a browser over http and in the future bundler without import maps. Add every new package to `ALLOWED` in `scripts/check-boundaries.js`; dependencies point downward only.
- `strata-core` and `strata` never touch the DOM or browser storage; environment differences go behind adapters.
- Every model change is a command on the bus. Handlers must be deterministic so the op log replays exactly: allocate ids only with `ctx.newId()`, write only through `ctx.tx`, iterate in id order (store lookups already return sorted results), and never read the clock or randomness directly. A handler may normalise its payload in place (e.g. pin the resolved type version) so replay needs no registry.
- Entities are frozen plain objects; commands and snapshots must survive `JSON.stringify`.
- Errors are `StrataError` with a `code`; messages should say what to do next.
- Clients reach the model only through the `strata` facade; handles never expose the core.
- Tests live next to each package in `test/`; helpers and fixtures there must not end in `.test.js`.
