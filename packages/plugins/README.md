# strata-plugins

Manifest validation, the in-house bundler and minifier, the component packer, and loaders for packed scripts, zips and folders.

- Runs in: Main thread, Node
- Specification: spec §8
- Entry point: `src/index.js`, the only file other packages may import (eng §4)
- Tests: `test/`, run with `npm test`

## Manifest validation

`validateManifest(manifest, { files })` reports every problem at once, as errors and warnings. It is what `strata validate` and the upload dialog show.

- **Core checks.** Errors come from the core's `checkManifest`, which the registry also applies:
  - identity and `strataApi`: the core supports plugin API `^1.0`;
  - ports, and that every method a port `exposes` is declared public;
  - properties, and state fields, each with an initial value of its type;
  - public and private methods, whose `latency` is a distribution or a property that holds one;
  - metrics.
- **Plugin checks.** It adds what a packed plugin must also get right:
  - reserved `base:` ids;
  - templates and migrations that are lists of files and JavaScript modules;
  - with `files`, that every file the manifest names is in the folder.
- **Codes.** Each error carries an `E_MANIFEST_` code from `packages/core/src/errors/codes.js`, such as `E_MANIFEST_UNKNOWN_METHOD`.
- **Warnings.** Warnings name unknown keys, missing units and missing icons.

## Behaviour contract

`behaviour.js` holds the contract between a component's behaviour module and the simulation (spec §8, eng §10).

- **Types.** `BehaviourContext` types the `ctx` that methods and hooks receive, and `Behaviour` types a module's default export: `public`, `private`, `init`, `onTimer` and `onFault`.
- **`validateBehaviour(behaviour, manifest)`** checks the default export against the manifest:
  - only known hooks, and functions where functions belong;
  - no name that is both public and private;
  - public methods exactly as the manifest declares them.

  A declared method the behaviour leaves out is an error, or only a warning when the manifest extends a base type that may provide it.
- **`checkModuleState(source, file)`** flags module-level mutable state in a module's source: a module-level `let` or `var`, or a module-level object, array, map or set that the module changes. One worker runs every instance of a component, so such state leaks between nodes.
- **`createTestContext(options)`** gives component authors a `ctx` for unit tests, with no kernel:
  - props start from the manifest's defaults, and state from its initial values;
  - `ctx.call` runs the behaviour's private methods, and `ctx.send` answers from `replies`;
  - it records what a method sends, emits, calls, fails, measures, logs and schedules, and every state change with its path;
  - setting a state field the manifest does not declare throws.
