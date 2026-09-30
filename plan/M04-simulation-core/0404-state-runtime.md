# 0404 Typed state at run time

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M04 Simulation core](../ROADMAP.md#m04-simulation-core) | R0 | done | [0403](../M04-simulation-core/0403-ctx-dispatch.md) |

## Read first

- [Spec §6 Component anatomy](../../docs/spec/06-component-anatomy.md): State

## Goal

Initialise state from manifest defaults, instance overrides and fixtures; enforce typed containers; record every change for the debugger.

## Tests to write first

Write these tests first, in `packages/sim/test/state.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [x] Instance initial state overrides the manifest's initial values
- [x] `queue`, `list`, `map` and `table` enforce their shapes
- [x] Every state change is recorded with its event number and method span

## Done when

- [x] Every test above passes, and no test was weakened, skipped or deleted to get there
- [x] `npm run check` passes
- [x] New or changed public APIs have JSDoc, and facade methods have help metadata
- [x] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [x] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)

## Notes

- **Where it lives.** `packages/sim/src/state.js`: `initialState`, the per-call `stateView`, and `copy`. Core's `checkValue` already knew queues, lists, maps and tables, so the view checks each write against the schema of the part it writes, rather than the whole field.
- **Moving rows.** A table row the table already holds is moving (`splice`, `sort`, `shift`), so only new rows are checked, and only they or a written key cell must keep keys unique. Writing a column a table does not declare onto an existing row fails with `E_SCHEMA_FIELD`.
- **Beyond the listed tests.** Once state is behind views, a response carrying state must be a copy, or a caller could change a callee's state; a test covers it, and message bodies, responses and log arguments are now copies. The goal names fixtures, so a test covers a table's rows from CSV (RFC 4180 quoting, cells typed by their columns).
- **Changes.** Each is `{ event, spanId, node, op, path, value }`, where `event` is the kernel's event number, so a change in a private call carries that call's span. Snapshots and stepping back come in 0413.

