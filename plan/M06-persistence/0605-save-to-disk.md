# 0605 Saving to disk and storage warnings

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M06 Persistence](../ROADMAP.md#m06-persistence) | R0 | todo | [0604](../M06-persistence/0604-strata-file.md) |

## Read first

- [Spec §19 Storage, persistence and file format](../../docs/spec/19-storage-persistence-and-file-format.md): Saving to disk, The file:// caveat

## Goal

Save and Save As through the File System Access API with a download fallback, the export reminder, `persist()` and quota display, and the Firefox `file://` warning.

## Tests to write first

Write these tests first, in `packages/ui/test/save.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] In Chromium, Mod+S writes the chosen file in place
- [ ] Browsers without the API fall back to a download
- [ ] The first run on Firefox from `file://` shows the storage warning once

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
