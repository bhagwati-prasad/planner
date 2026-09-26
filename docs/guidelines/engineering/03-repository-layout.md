# 3. Repository layout

Strata is a single monorepo with one package per row of the spec's package table, plus a facade package.

```
strata/
  packages/
    core/          model, command bus, undo, op log, resolver, roll-ups
    facade/        the public `strata` API composed from the packages below
    plugins/       registry, manifest validation, loaders, bundler
    sim/           discrete-event kernel and worker entry
    debug/         breakpoints, stepping, snapshots
    test/          test DSL, runner, rule engine, reporters
    docs/          doc model, templates, live bindings, exporters
    plan/          tickets, generation rules, exporters
    comments/      threads, anchors, orphan and outdated detection
    storage/       IndexedDB, sessionStorage, localStorage, file and Node adapters
    graph/         strata-graph, the generic D3 diagram library
    3d/            Three.js stack and isometric views
    ui/            Web Components shell, panels, editors, tokens
    cli/           the `strata` command
    server/        local server (R0), sync server (R4)
  components/      built-in components, same folder format as user components
  connection-types/
  templates/       doc and ticket templates
  vendor/          d3 (UMD build), three (ES module, bundled to IIFE by our build)
  tools/           bundler, lint rules, benchmarks, test helpers
  tests/e2e/       browser tests, served and file:// modes
  docs/
    adr/
    guidelines/
```

Every package follows the same internal shape:

```
packages/<name>/
  src/
    index.js       the only file other packages may import
    ...
  test/
  README.md
  package.json     "private": true, "type": "module", no "dependencies"
```

Three.js no longer ships a classic-script build, so the build step bundles its ES module into an IIFE for the offline app. D3 ships a UMD build that is used as is.

---
Part of the [Strata Engineering Guidelines](README.md).
