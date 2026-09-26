# Strata: instructions for the coding agent

Strata is a browser-first tool to design, simulate, debug, test, document and plan software architectures. An architecture is a directed graph of components, any component can contain its own architecture, and simulation is the core feature. It runs offline from `file://`, is built with vanilla JavaScript, Web Components, D3.js and Three.js, and everything works headlessly from the browser console and Node.

## Where things are

| Path | What it holds |
| --- | --- |
| `plan/ROADMAP.md` | Milestones and the task checklist: your to-do list |
| `plan/Mxx-*/NNNN-*.md` | One task per file: goal, tests to write first, done-when list |
| `plan/LOG.md` | One line per finished task |
| `docs/spec/` | Product and technical specification, one file per section |
| `docs/guidelines/engineering/` | Engineering rules |
| `docs/guidelines/design-system/` | UI/UX design system |
| `docs/adr/` | Architecture decision records |

A reference such as "spec §11" or "eng §13" means the file with that number in the matching folder. Read only the sections a task links, unless you genuinely need more.

## Every session

1. **Pick one task.** Use the task the human names. Otherwise take the first unchecked task in `plan/ROADMAP.md` whose dependencies are all checked, and say which one you took.
2. **Read** the task file, the sections under "Read first", and the last five lines of `plan/LOG.md`.
3. **Plan briefly:** list the files you will touch and the tests you will write. Continue unless the human has asked to approve plans.
4. **Red, green, refactor** as described below.
5. **Finish:** `npm run check` passes; set the task status to `done`; tick the task in `plan/ROADMAP.md`; append one line to `plan/LOG.md`; commit with a Conventional Commit message ending in the task id, such as `feat(core): add system.extract command (0112)`.
6. **Stop** after one task unless the human asks for more.

## Test-driven development

This project is built test-first, without exception.

- **Red:** write the tests listed under "Tests to write first", plus any smaller unit tests you need. Run them. Each must fail for the reason it describes, not because of a syntax error, an import error or a missing file. Show the failing summary.
- **Green:** write the least code that makes them pass.
- **Refactor:** tidy up with every test green, then run the whole suite.
- Never write implementation code that no failing test asked for.
- Never weaken, skip, delete or `.only` a test to reach green. If a listed test is wrong, stop, explain why, and propose the corrected test.
- Fix a bug by first writing a test that reproduces it.
- Tests use the fake clock, fake scheduler and seeded generators from `tools/testing/`. No sleeps, real timers or network access.
- Name tests for behaviour: `describe('system.extract')`, then `it('creates one boundary port per crossing edge')`.
- Build test state through commands or fixture builders, never by hand-assembling state objects.
- Simulation changes must keep the determinism suite green in Node, Chromium, Firefox and WebKit.
- Visual snapshot baselines are created or updated only after the human approves the screenshots.

## Commands

Task 0007 creates these. Before then, use whatever already exists.

| Command | What it runs |
| --- | --- |
| `npm test` | All Node tests: unit, property, contract and determinism |
| `node --test path/to/file.test.js` | One Node test file |
| `npm run test:browser` | Playwright tests in Chromium, Firefox and WebKit, served and from `file://` |
| `npx playwright test path/to/file.spec.js` | One browser test file |
| `npm run lint`, `npm run typecheck`, `npm run format` | Static checks and formatting |
| `npm run build` | Builds `dist/`, including the offline `strata.html` |
| `npm run bench` | Performance benchmarks |
| `npm run check` | Everything CI runs; must pass before every commit |

## Rules that are never broken

- The core never touches the DOM or browser globals.
- Every model change is a command on the command bus, including in tests, importers and migrations.
- The UI talks only to the facade.
- No wall clock and no `Math.random` outside the UI; use the injected clock, scheduler and PRNG.
- Everything works from `file://`.
- No runtime dependencies besides vendored D3 and Three.js.
- Every persisted format has a schema version and a migration.
- Every entity has a ULID and audit fields.
- Built-in components use only the public plugin API.
- Simulation is deterministic.
- Every component is runnable: black-box defaults, typed state, every step unit.
- Private methods are never reachable over edges.

The reasons behind each rule are in `docs/guidelines/engineering/02-non-negotiables.md`.

## Ask the human first

- Adding any dependency, runtime or development.
- Changing the plugin API, the `.strata` format, command semantics, the worker protocol or kernel semantics. Draft an ADR in `docs/adr/` and stop.
- Doing anything that contradicts the spec or guidelines. Propose an ADR instead of working around it.
- Creating or updating visual snapshot baselines.
- Splitting, merging or reordering tasks. You may propose it.

## If a task is too big

Stop at a point where every test passes, commit, add a "Remaining" section to the task file, and propose a split.

## Style at a glance

ES2022 modules with `.js` import extensions, `// @ts-check` and JSDoc types, named exports, 2-space indent, no semicolons and single quotes. Errors are `StrataError` instances with codes registered in `packages/core/src/errors/codes.js`. Values are stored in canonical units (eng §8). The full rules are in `docs/guidelines/engineering/`.
