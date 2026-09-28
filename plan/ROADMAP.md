# Strata roadmap

Every milestone is a folder of task files, and every task is one agent session that ends with all tests passing. Take the first unchecked task whose dependencies are all checked, unless the human names a different one.

Tick a task here only when its "Done when" list is complete. If a task is split, add the new tasks here with their ids and dependencies in the same commit.

| Release | Theme | Milestones | Tasks |
| --- | --- | --- | --- |
| R0 | Foundations and simulation core | M00–M07 | 80 |
| R1 | Load, chaos and tests | M08–M12 | 18 |
| R2 | Document and plan | M13–M17 | 21 |
| R3 | Versioning and git teamwork | M18–M20 | 11 |
| R4 | Real-time collaboration | M21–M23 | 12 |
| R5 | Multi-tenant SaaS | M24–M26 | 11 |
| Total | | 27 | 153 |

## R0 Foundations and simulation core

**Exit criteria:** A user draws a three-level system offline, sends a request through it, pauses mid-flight, steps back three hops, changes a queue's capacity, replays from that moment and compares the two runs.

### M00 Foundation and walking skeleton

Tooling, guardrails and CI first, then the thinnest end-to-end slice (one request through two components, drawn on a canvas, from file://) to prove the riskiest integration points in week one.

- [x] [0001 Repository scaffold and npm workspaces](M00-foundation-and-walking-skeleton/0001-repo-scaffold.md)
- [x] [0002 Formatting, lint and type-check tooling](M00-foundation-and-walking-skeleton/0002-dev-tooling.md) (after 0001)
- [x] [0003 Custom lint rules for the non-negotiables](M00-foundation-and-walking-skeleton/0003-custom-lint-rules.md) (after 0002)
- [x] [0004 Test harness, fakes and property-test generators](M00-foundation-and-walking-skeleton/0004-test-harness.md) (after 0001)
- [x] [0005 In-house zero-dependency bundler](M00-foundation-and-walking-skeleton/0005-bundler.md) (after 0001)
- [x] [0006 Vendored D3 and Three.js with integrity pins](M00-foundation-and-walking-skeleton/0006-vendor-libs.md) (after 0005, 0007)
- [x] [0007 CI pipeline and browser test harness](M00-foundation-and-walking-skeleton/0007-ci-and-browser-tests.md) (after 0002, 0003, 0004, 0005)
- [x] [0008 Walking skeleton: minimal model and command bus](M00-foundation-and-walking-skeleton/0008-skeleton-core.md) (after 0004)
- [x] [0009 Walking skeleton: one request through two components](M00-foundation-and-walking-skeleton/0009-skeleton-sim.md) (after 0005, 0007, 0008)
- [x] [0010 Walking skeleton: draw and animate](M00-foundation-and-walking-skeleton/0010-skeleton-canvas.md) (after 0006, 0009)

### M01 Core

The headless heart: immutable state, commands, undo, op log, graph invariants, recursion, bindings, roll-ups and the facade, all testable in Node.

- [x] [0101 Immutable state and structural sharing](M01-core/0101-state-helpers.md) (after 0008)
- [x] [0102 StrataError and the error code registry](M01-core/0102-errors.md) (after 0101)
- [x] [0103 Injected id, clock, PRNG, scheduler and logger adapters](M01-core/0103-adapters.md) (after 0102)
- [x] [0104 Command bus](M01-core/0104-command-bus.md) (after 0103)
- [x] [0105 Undo, redo and atomic batches](M01-core/0105-undo-batches.md) (after 0104)
- [x] [0106 Operation log and command versions](M01-core/0106-op-log.md) (after 0105)
- [x] [0107 Schema validator for properties and state](M01-core/0107-schema-validator.md) (after 0102)
- [x] [0108 Canonical units and conversions](M01-core/0108-units.md) (after 0107)
- [x] [0116 Store property values in canonical units](M01-core/0116-canonical-property-values.md) (after 0108)
- [x] [0109 Graph model and invariants](M01-core/0109-graph-model.md) (after 0105, 0107)
- [x] [0110 The recursion resolver and its guards](M01-core/0110-recursion-resolver.md) (after 0109)
- [x] [0117 Every node is a typed component](M01-core/0117-typed-nodes.md) (after 0110)
- [x] [0118 Open a component as a system](M01-core/0118-open-as-system.md) (after 0117)
- [x] [0119 Core within its size budget](M01-core/0119-core-size.md) (after 0118)
- [x] [0111 Method bindings across boundaries](M01-core/0111-method-bindings.md) (after 0110)
- [x] [0112 Extract as system and inline system](M01-core/0112-extract-inline.md) (after 0111)
- [x] [0113 Roll-up engine](M01-core/0113-rollups.md) (after 0111)
- [x] [0114 The recursive payments fixture](M01-core/0114-recursive-fixture.md) (after 0112, 0113)
- [x] [0115 Facade handles for recursion](M01-core/0115-facade.md) (after 0114, 0106)
- [x] [0120 Help metadata for every facade method](M01-core/0120-facade-help.md) (after 0115)

### M02 strata-graph

The generic D3 diagram library: data in, intents out, fast at 500+ components, with every visual state from the design system.

- [x] [0201 Scene, layers and zoom](M02-strata-graph/0201-scene-zoom.md) (after 0010, 0007)
- [x] [0202 Shape registry, components and ports](M02-strata-graph/0202-shapes-ports.md) (after 0201)
- [x] [0210 Visual snapshot harness](M02-strata-graph/0210-visual-harness.md) (after 0202)
- [x] [0209 Node states](M02-strata-graph/0209-node-states.md) (after 0202, 0210)
- [x] [0203 Edges, arrowheads and routing](M02-strata-graph/0203-edges-routing.md) (after 0202, 0210)
- [x] [0204 Selection, dragging and connecting as intents](M02-strata-graph/0204-selection-intents.md) (after 0203)
- [ ] [0205 Snapping, smart guides, align and distribute](M02-strata-graph/0205-snapping-guides.md) (after 0204)
- [ ] [0206 Frames, zones, boundaries and annotations](M02-strata-graph/0206-frames-annotations.md) (after 0204)
- [ ] [0207 Level of detail and performance](M02-strata-graph/0207-lod-performance.md) (after 0206)
- [ ] [0208 Overlays and export](M02-strata-graph/0208-overlays-export.md) (after 0207)

### M03 Component model and plugins

Manifests with properties, state, public and private methods and metrics; the registry; packing, loading, serving, scaffolding and validation.

- [ ] [0301 Manifest schema](M03-component-model-and-plugins/0301-manifest-schema.md) (after 0107)
- [ ] [0302 Component registry and versions](M03-component-model-and-plugins/0302-registry.md) (after 0301)
- [ ] [0303 Behaviour contract and component test harness](M03-component-model-and-plugins/0303-behaviour-contract.md) (after 0301)
- [ ] [0304 strata pack](M03-component-model-and-plugins/0304-pack-cli.md) (after 0005, 0302)
- [ ] [0305 Registration and upload loaders](M03-component-model-and-plugins/0305-loaders.md) (after 0304)
- [ ] [0306 strata serve](M03-component-model-and-plugins/0306-serve.md) (after 0304)
- [ ] [0307 strata new component, validate and test-component](M03-component-model-and-plugins/0307-scaffold-validate.md) (after 0303, 0304)
- [ ] [0308 Connection-type plugins](M03-component-model-and-plugins/0308-connection-types.md) (after 0302)

### M04 Simulation core

The core feature, built headless first: kernel, sandbox, method dispatch, typed state, black-box and expanded composites, the starter library, scopes and stubs, stepping in every unit, editing paused runs and branches.

- [ ] [0401 Kernel: event queue, integer time and PRNG streams](M04-simulation-core/0401-kernel.md) (after 0009, 0103)
- [ ] [0402 Worker hosts, sandbox and protocol](M04-simulation-core/0402-worker-host.md) (after 0401, 0303)
- [ ] [0403 ctx API and method dispatch](M04-simulation-core/0403-ctx-dispatch.md) (after 0402, 0111)
- [ ] [0404 Typed state at run time](M04-simulation-core/0404-state-runtime.md) (after 0403)
- [ ] [0405 Edges, routing and the network model](M04-simulation-core/0405-edges-network.md) (after 0403, 0308)
- [ ] [0406 Black-box and expanded composites](M04-simulation-core/0406-black-box-expanded.md) (after 0403, 0112)
- [ ] [0407 Base behaviours](M04-simulation-core/0407-base-behaviours.md) (after 0404, 0405)
- [ ] [0408 Starter library: messaging and workers](M04-simulation-core/0408-starter-messaging.md) (after 0407)
- [ ] [0409 Starter library: services, functions, gateways and balancers](M04-simulation-core/0409-starter-compute.md) (after 0407)
- [ ] [0410 Starter library: data stores](M04-simulation-core/0410-starter-data.md) (after 0407)
- [ ] [0411 Starter library: edge, clients and external](M04-simulation-core/0411-starter-edge.md) (after 0407)
- [ ] [0412 Scopes, stubs and inbound traffic](M04-simulation-core/0412-scope-stubs.md) (after 0406)
- [ ] [0413 Snapshots, step units and time travel](M04-simulation-core/0413-snapshots-stepping.md) (after 0404)
- [ ] [0414 Run lifecycle and controls](M04-simulation-core/0414-run-controls.md) (after 0413)
- [ ] [0415 Editing a paused run and branch runs](M04-simulation-core/0415-edits-branches.md) (after 0414)
- [ ] [0416 Breakpoints and inspection](M04-simulation-core/0416-breakpoints-inspection.md) (after 0414)
- [ ] [0417 Simulation on the facade and the determinism suite](M04-simulation-core/0417-facade-sim.md) (after 0415, 0416, 0412, 0115)

### M05 Shell

The Web Components UI over the facade: tokens, kit, layout, canvas adapter, library, inspector, depth navigation, run controls, scrubber and keyboard access.

- [ ] [0501 Design tokens, themes and fonts](M05-shell/0501-tokens-themes.md) (after 0007)
- [ ] [0502 StrataElement base class and shell config](M05-shell/0502-strata-element.md) (after 0501, 0115)
- [ ] [0503 UI kit: controls](M05-shell/0503-kit-controls.md) (after 0502)
- [ ] [0504 UI kit: containers and feedback](M05-shell/0504-kit-containers.md) (after 0502)
- [ ] [0505 App shell, layout and command palette](M05-shell/0505-app-shell.md) (after 0503, 0504)
- [ ] [0506 Canvas view adapter and outline view](M05-shell/0506-canvas-adapter.md) (after 0505, 0208)
- [ ] [0507 Library panel and project tree](M05-shell/0507-library-panel.md) (after 0506)
- [ ] [0508 Inspector: properties, state and methods](M05-shell/0508-inspector.md) (after 0506)
- [ ] [0509 Depth language and drill navigation](M05-shell/0509-depth-navigation.md) (after 0506)
- [ ] [0510 Run control bar and scope picker](M05-shell/0510-run-bar.md) (after 0506, 0417)
- [ ] [0511 Scrubber, runs panel and canvas run overlays](M05-shell/0511-scrubber-runs.md) (after 0510)
- [ ] [0512 Keyboard map and accessibility pass](M05-shell/0512-keyboard-a11y.md) (after 0511, 0509, 0508, 0507)

### M06 Persistence

Projects survive reloads, crashes and moves between machines: IndexedDB, the write-ahead log, multi-tab safety, the .strata file and saving to disk.

- [ ] [0601 IndexedDB storage adapter](M06-persistence/0601-idb-adapter.md) (after 0106)
- [ ] [0602 Write-ahead log and crash recovery](M06-persistence/0602-wal-recovery.md) (after 0601)
- [ ] [0603 Multi-tab safety](M06-persistence/0603-multi-tab.md) (after 0601)
- [ ] [0604 The .strata file format](M06-persistence/0604-strata-file.md) (after 0601, 0302)
- [ ] [0605 Saving to disk and storage warnings](M06-persistence/0605-save-to-disk.md) (after 0604)
- [ ] [0606 Node filesystem adapter](M06-persistence/0606-node-storage.md) (after 0604)

### M07 Comments and R0 release

Annotations and threaded comments designed for later collaboration, then the R0 exit test and release.

- [ ] [0701 Annotations](M07-comments-and-r0-release/0701-annotations.md) (after 0206, 0506)
- [ ] [0702 Comment threads and anchors](M07-comments-and-r0-release/0702-threads-anchors.md) (after 0115)
- [ ] [0703 Comments UI and roll-up badges](M07-comments-and-r0-release/0703-comments-ui.md) (after 0702, 0511)
- [ ] [0704 R0 exit test and release](M07-comments-and-r0-release/0704-r0-exit.md) (after 0701, 0703, 0605, 0512, 0305, 0306)

## R1 Load, chaos and tests

**Exit criteria:** A checkout flow runs at 500 req/s, a failing SLO test is debugged to its bottleneck, and the same test passes in CI through the CLI.

### M08 Scenarios and load

From single requests to realistic traffic: scenarios, load profiles, fixtures, the metrics pipeline and performance at scale.

- [ ] [0801 Scenarios](M08-scenarios-and-load/0801-scenarios.md) (after 0704)
- [ ] [0802 Load profiles and concurrency](M08-scenarios-and-load/0802-load-profiles.md) (after 0801)
- [ ] [0803 State fixtures](M08-scenarios-and-load/0803-fixtures.md) (after 0802)
- [ ] [0804 Metrics pipeline and charts](M08-scenarios-and-load/0804-metrics-pipeline.md) (after 0802)
- [ ] [0805 Performance at scale](M08-scenarios-and-load/0805-scale-bench.md) (after 0804)

### M09 Chaos and analysis

Break things on purpose and explain the results: faults, heat overlays, bottleneck detection, black-box calibration and autoscaling.

- [ ] [0901 Fault injection](M09-chaos-and-analysis/0901-faults.md) (after 0802)
- [ ] [0902 Heat overlays and bottleneck finder](M09-chaos-and-analysis/0902-heat-bottleneck.md) (after 0804)
- [ ] [0903 Black-box calibration](M09-chaos-and-analysis/0903-calibration.md) (after 0406, 0804)
- [ ] [0904 Autoscaling and resilience behaviour under load](M09-chaos-and-analysis/0904-autoscaling.md) (after 0901)

### M10 Debugger depth

The rest of the debugger: trace waterfall, logs, watches and an in-app console.

- [ ] [1001 Trace waterfall](M10-debugger-depth/1001-trace-waterfall.md) (after 0804)
- [ ] [1002 Logs and watches](M10-debugger-depth/1002-logs-watches.md) (after 0416)
- [ ] [1003 In-app console](M10-debugger-depth/1003-dock-console.md) (after 0417)

### M11 Tests and architecture rules

Tests as first-class artefacts: DSL and JSON specs, the five test types, architecture rules, reporters, CLI runners and the test panel.

- [ ] [1101 Test DSL and runner](M11-tests-and-rules/1101-test-runner.md) (after 0802)
- [ ] [1102 Architecture rules](M11-tests-and-rules/1102-rules.md) (after 1101)
- [ ] [1103 Reporters and CLI runners](M11-tests-and-rules/1103-reporters-cli.md) (after 1101)
- [ ] [1104 Tests panel and form authoring](M11-tests-and-rules/1104-tests-panel.md) (after 1101, 1001)

### M12 Patterns and R1 release

Reusable patterns, then the R1 exit test and release.

- [ ] [1201 Patterns library](M12-patterns-and-r1-release/1201-patterns.md) (after 0509)
- [ ] [1202 R1 exit test and release](M12-patterns-and-r1-release/1202-r1-exit.md) (after 1201, 1104, 1103, 0904, 0903, 1002, 1003, 0805)

## R2 Document and plan

**Exit criteria:** A full doc set and backlog are generated from one model, and every ticket traces to a component and a requirement.

### M13 Docs engine

Living documents attached to systems: the doc model, block editor, live bindings and exporters.

- [ ] [1301 Doc model and doc tree](M13-docs-engine/1301-doc-model.md) (after 1202)
- [ ] [1302 Block editor](M13-docs-engine/1302-block-editor.md) (after 1301)
- [ ] [1303 Live bindings](M13-docs-engine/1303-live-bindings.md) (after 1302)
- [ ] [1304 Doc exporters and strata docs](M13-docs-engine/1304-doc-exporters.md) (after 1303)

### M14 Doc types, ADRs and traceability

Every doc type from the spec, the ADR lifecycle, traceability and conversions from comments.

- [ ] [1401 Doc templates](M14-doc-types-and-traceability/1401-templates.md) (after 1303)
- [ ] [1402 ADR lifecycle](M14-doc-types-and-traceability/1402-adr-lifecycle.md) (after 1401)
- [ ] [1403 Traceability matrix and impact analysis](M14-doc-types-and-traceability/1403-traceability.md) (after 1402, 1502)
- [ ] [1404 Converting comments](M14-doc-types-and-traceability/1404-conversions.md) (after 1402, 1502)

### M15 Tickets

The execution plan: tickets, backlog, board, timeline, generation from the model and Jira export.

- [ ] [1501 Ticket model](M15-tickets/1501-ticket-model.md) (after 1202)
- [ ] [1502 Backlog and board](M15-tickets/1502-backlog-board.md) (after 1501)
- [ ] [1503 Timeline view](M15-tickets/1503-timeline.md) (after 1501)
- [ ] [1504 Ticket generation from the model](M15-tickets/1504-generation.md) (after 1501)
- [ ] [1505 Jira CSV export and strata tickets](M15-tickets/1505-jira-export.md) (after 1504)

### M16 AI assistance

Optional, bring-your-own-key AI that only ever proposes diffs.

- [ ] [1601 AI provider adapters](M16-ai-assistance/1601-ai-providers.md) (after 1303)
- [ ] [1602 AI actions as suggestion diffs](M16-ai-assistance/1602-ai-actions.md) (after 1601, 1404, 1504)

### M17 Visual extras and R2 release

The 3D and isometric views, sketch mode, draw.io import, conditional breakpoints and quarantine, then the R2 release.

- [ ] [1701 3D stack view](M17-visual-extras-and-r2-release/1701-stack-3d.md) (after 1202)
- [ ] [1702 Isometric deployment view](M17-visual-extras-and-r2-release/1702-isometric.md) (after 1701)
- [ ] [1703 Sketch mode and draw.io import](M17-visual-extras-and-r2-release/1703-sketch-drawio.md) (after 1202)
- [ ] [1704 Conditional breakpoints](M17-visual-extras-and-r2-release/1704-conditional-breakpoints.md) (after 1002)
- [ ] [1705 Quarantine mode for untrusted components](M17-visual-extras-and-r2-release/1705-quarantine.md) (after 0402)
- [ ] [1706 R2 exit test and release](M17-visual-extras-and-r2-release/1706-r2-exit.md) (after 1403, 1505, 1602, 1701, 1702, 1703, 1704, 1705, 1304)

## R3 Versioning and git teamwork

**Exit criteria:** Two people edit the same project in branches and merge without hand-editing JSON.

### M18 Project folder and merge

Projects that live happily in git: a diff-friendly folder format, semantic merge and cross-project references.

- [ ] [1801 Git-friendly project folder](M18-project-folder-and-merge/1801-folder-format.md) (after 1706)
- [ ] [1802 Semantic merge driver](M18-project-folder-and-merge/1802-merge-driver.md) (after 1801)
- [ ] [1803 Cross-project system references](M18-project-folder-and-merge/1803-cross-project-refs.md) (after 1801)

### M19 Versions, diff and what-if

Model history you can see: named snapshots, visual diff and in-project what-if branches.

- [ ] [1901 Named model snapshots](M19-versions-diff-and-what-if/1901-model-snapshots.md) (after 1801)
- [ ] [1902 Visual diff](M19-versions-diff-and-what-if/1902-visual-diff.md) (after 1901)
- [ ] [1903 What-if branches](M19-versions-diff-and-what-if/1903-what-if-branches.md) (after 1901)

### M20 Integrations, cost and planning

Cost estimates, pushing tickets to trackers, DOCX export and fuller planning, then the R3 release.

- [ ] [2001 Cost model](M20-integrations-cost-and-planning/2001-cost-model.md) (after 0902)
- [ ] [2002 Push to Jira, Linear and GitHub Issues](M20-integrations-cost-and-planning/2002-tracker-push.md) (after 1505)
- [ ] [2003 DOCX export](M20-integrations-cost-and-planning/2003-docx-export.md) (after 1304)
- [ ] [2004 Initiatives, custom fields, sprints and roadmap](M20-integrations-cost-and-planning/2004-planning-extras.md) (after 1503)
- [ ] [2005 R3 exit test and release](M20-integrations-cost-and-planning/2005-r3-exit.md) (after 1802, 1803, 1902, 1903, 2001, 2002, 2003, 2004)

## R4 Real-time collaboration

**Exit criteria:** Five people co-edit one system live and a suggestion is accepted after review.

### M21 Sync server and accounts

A self-hostable server with accounts, workspaces, server-ordered sync, offline catch-up and system-level permissions.

- [ ] [2101 Server foundation](M21-sync-server-and-accounts/2101-server-foundation.md) (after 2005)
- [ ] [2102 Accounts and workspaces](M21-sync-server-and-accounts/2102-accounts-workspaces.md) (after 2101)
- [ ] [2103 Operation-log sync](M21-sync-server-and-accounts/2103-oplog-sync.md) (after 2102)
- [ ] [2104 Local identities to accounts](M21-sync-server-and-accounts/2104-identity-mapping.md) (after 2103)
- [ ] [2105 Roles and system-level permissions](M21-sync-server-and-accounts/2105-permissions.md) (after 2103)

### M22 Live co-editing

Seeing and editing together: presence, the in-house text CRDT for docs, and structural conflict handling.

- [ ] [2201 Presence and follow mode](M22-live-co-editing/2201-presence.md) (after 2103)
- [ ] [2202 Text CRDT for docs](M22-live-co-editing/2202-text-crdt.md) (after 2103, 1302)
- [ ] [2203 Structural conflicts](M22-live-co-editing/2203-structural-conflicts.md) (after 2103)

### M23 Collaborative comments and review

Comments, suggestions and reviews for teams, then the R4 release.

- [ ] [2301 Live comments and notifications](M23-collaborative-comments-and-review/2301-live-comments.md) (after 2104, 0703)
- [ ] [2302 Suggestion comments](M23-collaborative-comments-and-review/2302-suggestions.md) (after 2301)
- [ ] [2303 Review and approval](M23-collaborative-comments-and-review/2303-review-approval.md) (after 2301)
- [ ] [2304 R4 exit test and release](M23-collaborative-comments-and-review/2304-r4-exit.md) (after 2105, 2201, 2202, 2203, 2302, 2303)

## R5 Multi-tenant SaaS

**Exit criteria:** A paying organisation onboards with SSO and runs architecture tests from its CI pipeline.

### M24 Multi-tenancy and identity

Organisations, enterprise sign-in and governance on a multi-tenant data layer.

- [ ] [2401 Organisations and tenant isolation](M24-multi-tenancy-and-identity/2401-tenancy.md) (after 2304)
- [ ] [2402 SSO and SCIM](M24-multi-tenancy-and-identity/2402-sso-scim.md) (after 2401)
- [ ] [2403 Organisation roles, audit log and data residency](M24-multi-tenancy-and-identity/2403-rbac-audit.md) (after 2401)

### M25 Registry, runs and API

Shared components, server-side runs for CI, and a public API.

- [ ] [2501 Component registry](M25-registry-runs-and-api/2501-registry.md) (after 2401)
- [ ] [2502 Server-side run service](M25-registry-runs-and-api/2502-run-service.md) (after 2401)
- [ ] [2503 Public API and webhooks](M25-registry-runs-and-api/2503-public-api.md) (after 2502)

### M26 Integrations, billing and launch

The last integrations, billing, and the SaaS launch.

- [ ] [2601 Two-way Jira sync](M26-integrations-billing-and-launch/2601-jira-sync.md) (after 2002, 2401)
- [ ] [2602 Confluence export](M26-integrations-billing-and-launch/2602-confluence-export.md) (after 1304, 2401)
- [ ] [2603 Email notifications](M26-integrations-billing-and-launch/2603-email-notifications.md) (after 2301, 2401)
- [ ] [2604 Usage-based billing](M26-integrations-billing-and-launch/2604-billing.md) (after 2401)
- [ ] [2605 R5 exit test and launch](M26-integrations-billing-and-launch/2605-r5-exit.md) (after 2402, 2403, 2501, 2503, 2601, 2602, 2603, 2604)
