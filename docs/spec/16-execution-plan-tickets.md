# 16. Execution plan (tickets)

The execution plan is a Jira-like backlog generated from the architecture and kept in step with it. Tickets link to components, ADRs, requirements and tests, and the epic tree follows the system tree.

## Hierarchy and fields

Initiative (R3) → Epic → Story → Sub-task, plus Bug and Spike types.

| Field | Notes |
| --- | --- |
| Key, title, type, status, priority | Keys like `PAY-42`; the prefix comes from the system |
| Description, acceptance criteria | Markdown; Gherkin supported for criteria |
| Story points, estimate | Optional heuristic suggestion from component complexity |
| Assignee, labels, sprint | Assignees are local identities until R4 |
| Dependencies | Blocks and blocked-by, used by the timeline |
| Links | Components, systems, ADRs, requirements, tests, comment threads |
| Custom fields | R3 |

## Views

- **Backlog:** ranked list with inline edit and drag-to-rank (R2).
- **Board:** kanban by status, swimlanes by epic, system or assignee (R2).
- **Timeline:** Gantt with dependencies and critical path (R2).
- **Sprint planning and roadmap:** R3.

## Generation from the model

Ticket templates are attached to component types and model events:

| Trigger | Generated tickets |
| --- | --- |
| New system, or a component opened as a system | An epic for it; inner systems become child epics |
| New service | Stories for scaffold and CI, one per public method, persistence, observability, load test to SLO, deploy and runbook |
| New queue | Stories for provisioning, DLQ and alerting, consumer idempotency |
| ADR accepted | A story to implement the decision, linked to the ADR |
| Failing test | A bug linked to the test and its failing run |
| Comment converted | A story or spike carrying the thread as context |

Regeneration never overwrites. It shows a diff of proposed additions, changes and obsolete tickets, and applies only what you accept.

## Export and integration

R2 exports Jira-compatible CSV (with a configurable field mapping) and JSON. R3 pushes to Jira, Linear and GitHub Issues through their APIs; R5 adds two-way Jira sync.

---
Part of the [Strata Product and Technical Specification](README.md).
