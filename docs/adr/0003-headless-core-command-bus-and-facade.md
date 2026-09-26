# 0003 Headless core, command bus and facade

Status: Accepted
Date: 2026-09-26

## Context and problem

Strata must work from the browser console and Node, the UI must be replaceable, and later releases add undo, history, merge and real-time sync.

## Decision outcome

The core never touches the DOM. Every model change is a serialisable command on one bus that validates, applies, records an inverse and emits events. Every client (the UI, the console, the CLI and later the SaaS API) uses one public facade.

## Consequences

- Good: undo, the op log, merge, sync and console scripting all share one path; the core is fully testable in Node.
- Bad: UI code can never take shortcuts into the model; lint rules enforce this.
- See spec §4 and §18, and engineering guidelines §6 and §7.
