# 19. Git workflow, reviews and releases

## Branches, commits and pull requests

- Trunk-based development on `main`. Branches are named `feat/`, `fix/`, `chore/` or `docs/` plus a short slug, and live for less than three days.
- Commits follow Conventional Commits, scoped by package: `feat(core): add system.extract command`.
- Pull requests change at most 400 lines, excluding fixtures and generated files. The description states what changed, why, and how it was tested; UI changes include screenshots in light and dark themes.
- Pull requests are squash-merged.

## Reviews

- One approval is required.
- Two approvals and an ADR are required for changes to the plugin API, file format, command semantics, the simulation kernel, the worker protocol or security-sensitive code.

## CI gates

All of these must pass before merge: formatting, lint (including import boundaries and banned globals), type-check, unit, property, contract and determinism tests, end-to-end tests in three browsers in both served and `file://` modes, accessibility, visual regression, bundle size, benchmarks and the licence check.

## Versions

| Artefact | Scheme |
| --- | --- |
| Application | Semver `MAJOR.MINOR.PATCH` |
| Plugin API (`strataApi`) | Semver, independent of the app |
| `.strata` file format | Integer `schemaVersion` |
| Worker protocol | Integer `v` |
| IndexedDB database | Integer version |

## Releases

- Releases are tagged `vX.Y.Z` from `main`, with a changelog generated from commit messages.
- Before release: migrations pass against fixtures from the previous release, the offline build is smoke-tested from `file://` in Chrome, Firefox and Safari, and docs are updated.
- Experimental features sit behind `strata.flags`. A flag is removed, one way or the other, within two releases.

---
Part of the [Strata Engineering Guidelines](README.md).
