# Vendored libraries

Third-party code shipped with Strata, so the offline app works from `file://` with no network (spec §4, §19). These are the only runtime dependencies (eng §16). Each keeps its own licence, and every file is pinned by SHA-256 in `manifest.json`.

| Library | Version | Files | Licence | Source |
| --- | --- | --- | --- | --- |
| D3 | 7.9.0 | `d3/d3.min.js` (UMD bundle, exposes `globalThis.d3`) | ISC (`d3/LICENSE`) | npm `d3@7.9.0`, `dist/d3.min.js`, unmodified |
| Three.js | 0.186.1 | `three/three.module.js`, `three/three.core.js` (ES modules) | MIT (`three/LICENSE`) | npm `three@0.186.1`, `build/three.module.js` and `build/three.core.js`, unmodified |
| IBM Plex | 1.1.0 (Sans), 2.5.0 (Mono) | `plex/IBMPlexSans-Regular-Latin1.woff2`, `plex/IBMPlexSans-SemiBold-Latin1.woff2`, `plex/IBMPlexMono-Regular-Latin1.woff2` (fonts) | OFL-1.1 (`plex/LICENSE.txt`) | npm `@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@2.5.0`, `fonts/split/woff2/` and `LICENSE.txt`, unmodified |

IBM Plex is a font, not code: design system §2 sets it for all interface text, and its Latin-1 files keep text measuring and rendering the same on every machine. The browser test harnesses load it through `tools/testing/browser/fonts.js` (task 0210); the app bundles it with the design tokens (0501).

Three.js no longer ships a classic-script build, so `npm run build` bundles its ES modules with the Strata bundler into `dist/vendor/three.js`. That is a classic script which defines `globalThis.THREE` and is loaded lazily by strata-3d. D3's UMD build is copied as it is. The build copies each licence next to its script (`dist/vendor/LICENSE-d3`, `dist/vendor/LICENSE-three`).

`npm run vendor:verify` (`tools/vendor/verify.js`) fails when a vendored file's bytes differ from its pin, a pinned file is missing, or a file in a library folder is not pinned. `npm run check` runs it through `tools/test/vendor.test.js`.

To update a library, first agree the version with the human (CLAUDE.md: dependencies). Then:

1. Run `npm pack <name>@<version>`, check the tarball against `npm view <name>@<version> dist.integrity`, and copy the files listed above, unmodified.
2. Run `npm run vendor:verify`. For each changed file it prints the expected pin and the new one. Put the new pins, the version and the tarball integrity in `manifest.json`, and update this table.
3. Run `npm run check`.
