# Help metadata

`strata.help()` (spec §18) is generated from the JSDoc of the facade (eng §20), so the help a console user reads and the documentation in the source are the same text.

| File | Holds |
| --- | --- |
| `generate.js` | Reads the exported classes of `packages/facade/src` and writes `packages/facade/src/help-data.js` |
| `packages/facade/src/help-data.js` | The generated metadata, checked in, so the facade works from source in Node and from `file://` |
| `packages/facade/src/help.js` | The topics: which classes each lists, and under which name (`sys`, `node`, `strata.nav` and so on) |

For each public method, the metadata holds its signature, the first sentence of its JSDoc description and its `@example`. An options object is shown as its keys, from the destructuring or from the `@param` type. A getter with a description gets that sentence. Methods tagged `@internal`, and names starting with `_`, are left out.

Run `npm run generate:help` after changing a facade method or its JSDoc. `packages/facade/test/help.test.js` fails when the checked-in file differs from what the generator writes, and when any method a console user can call has no entry in `strata.help()`. The `strata/facade-help` lint rule makes sure every method has a description and an example.
