# Working on Strata

## The spec

The specification is a Claude Docs document, not a file in this repo: "Strata — Architecture & Spec Planner: Product and Technical Specification", doc id `0c742d83-dac0-4db4-8367-aec636b81bd9` (https://claude.ai/code/artifact/0c742d83-dac0-4db4-8367-aec636b81bd9). Read it with the Claude Docs connector. Section numbers (§4, §6, ...) in code comments refer to it. `docs/implementation-notes.md` records what is built and every decision taken where the spec was silent; update it when you add to that list.

## Commands

- `npm test`: every `packages/*/test/**/*.test.js`, via `node:test`. Pass a substring to filter (`npm test -- recursion`).
- `npm run test:browser`: `packages/*/test/browser/*.browser.js` in real Chromium through Playwright (a dev tool found locally, via `PLAYWRIGHT_MODULE`, or in the global npm root; skipped with a note when absent).
- `npm run check`: architecture boundary check (dependency direction, no DOM or Node built-ins in headless code).
- `npm run verify`: all three. Run it before every commit.
- `npm run serve`: `strata serve` for the repo: the development app at `/app/` with the starter library served from `starter/` and watched. ES modules do not load from `file://`, and it sends the strict CSP the spec requires, so keep scripts in files, never inline.
- `npm run build`: the offline app in `dist/` (`strata.html` runs from `file://`), built with our own bundler.
- `npm run strata -- <command>`: the CLI (`new component`, `pack`, `validate`, `test-component`, `serve`, `repl`).
- `npm run demo`: the spec's console session, headless.
- `npm run typecheck`: JSDoc type check with `tsc --checkJs` (fetches TypeScript through npx; it is a dev tool, not a dependency).

## Rules

- JavaScript ES modules with JSDoc types. No TypeScript, no framework, no npm runtime dependencies. Node 20+.
- Packages import each other by relative path (`../../strata-core/src/index.js`) so the same files load in Node, in a browser over http and in our bundler without import maps. Add every new package to `ALLOWED` in `scripts/check-boundaries.js`; dependencies point downward only.
- The bundler (`strata-plugins`) builds the app from these sources, so browser code must not use top-level `await`, import cycles or reassigned exported `let`s; it rejects them with the file and line.
- `strata-server` and `strata-cli` are Node-only and may use `node:` built-ins; everything else stays headless or browser code. The typecheck skips the Node-only packages (no `@types/node`), so their tests carry them.
- `strata-core` and `strata` never touch the DOM or browser storage; environment differences go behind adapters.
- `strata-graph` knows nothing about Strata: it renders data and emits intents, never owns state. Only `src/dom/` may touch the DOM; D3 comes from the vendored global (`vendor/d3`) or `options.d3`, never an import.
- Every model change is a command on the bus. Handlers must be deterministic so the op log replays exactly: allocate ids only with `ctx.newId()`, write only through `ctx.tx`, iterate in id order (store lookups already return sorted results), and never read the clock or randomness directly. A handler may normalise its payload in place (e.g. pin the resolved type version) so replay needs no registry.
- Entities are frozen plain objects; commands and snapshots must survive `JSON.stringify`.
- Errors are `StrataError` with a `code`; messages should say what to do next.
- Clients reach the model only through the `strata` facade; handles never expose the core.
- Tests live next to each package in `test/`; helpers and fixtures there must not end in `.test.js`.
- `starter/` is the starter library as ordinary plugin folders. Keep each README's property table in step with its manifest (`packages/strata/test/starter.test.js` checks both).
