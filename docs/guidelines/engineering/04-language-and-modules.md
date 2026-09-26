# 4. Language and modules

- **Baseline:** ES2022, limited to features that are "Baseline widely available" in the latest two versions of Chrome, Edge, Firefox and Safari.
- **Modules:** source files are ES modules. Relative imports include the `.js` extension. The only bare specifiers are `d3` and `three`, which the bundler maps to the vendored files.
- **Offline constraints:** no top-level `await` and no dynamic `import()` in code that ships to the offline build. Lazy loading (Three.js, the 3D view) goes through the script loader in `strata-ui`, which injects a classic script tag.
- **Types:** every file starts with `// @ts-check`. Types are JSDoc typedefs kept in each package's `src/types.js`. CI runs `tsc --noEmit --checkJs` as a dev-only check.
- **Exports:** named exports only. The single exception is a component behaviour entry, which the plugin API requires to be a default export.
- **Boundaries:** code outside a package imports only that package's `src/index.js`. **(lint)**

---
Part of the [Strata Engineering Guidelines](README.md).
