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
