# Session log

One line per finished task, newest last, so the next session knows what just happened.

Format: `YYYY-MM-DD | task id | what changed | follow-ups or surprises`
2026-09-26 | 0001 | Migrated the pre-plan code into the eng §3 layout: packages renamed (strata-core→core, strata→facade, strata-plugins→plugins, strata-graph→graph, strata-ui→ui, strata-cli→cli, strata-server→server), eight new scaffolds (sim, debug, test, docs, plan, comments, storage, 3d), a README in every package, starter library moved to components/ and connection-types/, test runner discovers packages/*/test, tools/**/test and components/*/tests | The "no dependencies" test passed on first run (no package ever declared any); cli and server still import core/plugins directly, which eng §6 forbids (0003's lint rule will flag it); tooling still lives in scripts/ rather than tools/; existing code predates spec v2 names (node vs component, error codes), so later tasks will find partial implementations to adapt
