# 1001 Trace waterfall

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M10 Debugger depth](../ROADMAP.md#m10-debugger-depth) | R1 | todo | [0804](../M08-scenarios-and-load/0804-metrics-pipeline.md) |

## Read first

- [Spec §13 Debugger](../../docs/spec/13-debugger.md)
- [Design system §7 Components](../../docs/guidelines/design-system/07-components.md): Trace waterfall

## Goal

The waterfall view linked to the canvas, with an OpenTelemetry-shaped JSON export.

## Tests to write first

Write these tests first, in `packages/ui/test/trace.spec.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] Hovering a span highlights its component and edge on the canvas
- [ ] Spans inside an expanded composite are indented with a stratum tick
- [ ] The export validates against the OpenTelemetry trace JSON shape

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
