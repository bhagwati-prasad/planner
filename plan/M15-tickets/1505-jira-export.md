# 1505 Jira CSV export and strata tickets

| Milestone | Release | Status | Depends on |
| --- | --- | --- | --- |
| [M15 Tickets](../ROADMAP.md#m15-tickets) | R2 | todo | [1504](../M15-tickets/1504-generation.md) |

## Read first

- [Spec §16 Execution plan (tickets)](../../docs/spec/16-execution-plan-tickets.md): Export and integration

## Goal

Jira-compatible CSV with a field mapping, JSON export, and the `strata tickets` command.

## Tests to write first

Write these tests first, in `packages/plan/test/jira.test.js`. Run them and confirm each one fails for the reason it describes, not because of a syntax error or a missing file. Only then write the implementation.

- [ ] The CSV imports into Jira's documented CSV format (golden file)
- [ ] Custom field mappings are applied
- [ ] `strata tickets --format jira-csv` writes the file and exits 0

## Done when

- [ ] Every test above passes, and no test was weakened, skipped or deleted to get there
- [ ] `npm run check` passes
- [ ] New or changed public APIs have JSDoc, and facade methods have help metadata
- [ ] The [definition of done](../../docs/guidelines/engineering/23-definition-of-done.md) holds for this change
- [ ] Status above is `done`, the task is ticked in [ROADMAP.md](../ROADMAP.md), and a line is added to [LOG.md](../LOG.md)
