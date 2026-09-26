# Vendored libraries

Third-party code shipped with Strata so the offline app works from `file://` with no network (spec §4, §19). Each keeps its own licence.

| Library | Version | Files | Licence | Source |
| --- | --- | --- | --- | --- |
| D3 | 7.9.0 | `d3/d3.min.js` (UMD bundle, exposes `globalThis.d3`) | ISC (`d3/LICENSE`) | npm `d3@7.9.0`, `dist/d3.min.js`, unmodified |

To update: `npm pack d3@<version>`, copy `package/dist/d3.min.js` and `package/LICENSE` here, update this table and run `npm run check`.
