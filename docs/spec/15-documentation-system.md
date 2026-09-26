# 15. Documentation system

Strata generates a complete, living doc set from the model: templates provide structure, live bindings pull facts from the architecture and simulation, and optional AI drafts the prose. Docs attach to systems, so the doc tree mirrors the system tree and every level has its own set.

## Doc types

| Doc | Contents | Auto-populated from | Release |
| --- | --- | --- | --- |
| Product description (PRD) | Problem, personas, goals and non-goals, scope, user journeys, functional requirements with ids, success metrics | Requirement ids link to nodes, tests and tickets | R2 |
| ADR (MADR format) | Context, decision drivers, options with pros and cons, outcome, consequences, status, supersedes | Linked components' current props and a diagram excerpt | R2 |
| Architecture overview (arc42-lite) | Context, building blocks per level, runtime views, deployment, cross-cutting concepts | Heavily: diagrams, component tables, scenario traces as sequence diagrams | R2 |
| Component reference | Properties, state, public and private methods, metrics and bindings for every component | Manifests, instance values and bindings | R2 |
| Design guidelines | Two templates: engineering guidelines (code, architecture, testing, security) and a UI/UX design system (tokens, components, patterns, accessibility). Strata's own two guideline documents are the worked examples | Rules in force and their current pass rate | R2 |
| NFR catalogue | Availability, latency, throughput, RPO/RTO, scalability, security targets | Declared contracts, SLO tests and measured run results | R2 |
| API specification | OpenAPI 3.1 or AsyncAPI per component | Public methods, their schemas and the edges that call them | R2 |
| Data model | Entities per store, ERD | State schemas of store components | R2 |
| Threat model (STRIDE) | Threats per boundary-crossing flow | Edges crossing trust-boundary frames, with protocol, auth and TLS props | R2 |
| Deployment and infrastructure | Environments, regions, scaling, capacity | Deployment view and instance props | R2 |
| Test strategy | Suites, coverage of requirements, CI gates | Test catalogue and last results | R2 |
| Risk register | Risk, likelihood, impact, owner, mitigation | Comments typed "risk" and failing resilience tests | R2 |
| Glossary | Terms and definitions | Component and system names | R2 |
| Execution plan | Epics, stories, timeline | Tickets (§16) | R2 |
| Runbooks, release plan | Operations and rollout | Component doc templates | R3 |

## Editor and live bindings

The editor is a block-based Web Component (headings, text, lists, tables, callouts, embeds), stored as Markdown with front-matter. Strata directives embed live data:

```markdown
Max connections on the ledger DB: {{node:ledger-db.props.maxConnections}}

::diagram{system=payments view=logical}
::table{query="nodes where extends=base:queue" cols="name,capacity,retention"}
::metrics{run=latest node=api-gateway metrics="p95,errorRate"}
::trace{scenario=checkout as=sequence}
```

Bindings re-render when the model changes. Exports freeze values and stamp them "as of model revision N". A parent system's docs can embed summaries of child docs, which is roll-up applied to documentation.

## ADR lifecycle

Statuses are Proposed → Accepted → Deprecated or Superseded, with superseding links in both directions. Selecting a node shows its ADRs in the inspector's Links tab. From R4, acceptance can require named approvals.

## AI assistance (R2, opt-in)

- Providers sit behind one interface with adapters for Anthropic, OpenAI and Ollama; keys are stored locally and never exported.
- Actions: draft a PRD from notes, draft an ADR from a comment thread, write sections from the model, review the architecture against rules, propose tickets.
- Every AI output arrives as a suggestion diff to accept or reject; nothing is written silently.
- Direct browser calls need provider CORS support; the local server can proxy otherwise. Offline AI works with a local Ollama model.

## Export and versioning

R2 exports Markdown, a static HTML site with SVG diagrams, and PDF via a print stylesheet (headless PDF from Node when a Chromium is available). DOCX arrives in R3 and Confluence in R5. Docs are versioned with model snapshots.

---
Part of the [Strata Product and Technical Specification](README.md).
