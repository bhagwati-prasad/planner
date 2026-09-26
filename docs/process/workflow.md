# Working with the coding agent

This guide is for you, the human. The agent's own instructions are in `CLAUDE.md`.

## Your role

You are the architect and reviewer. The agent writes tests and code; you decide what is right. Keep these decisions for yourself:

- Approving public API shapes: the facade, the plugin API and the `.strata` format.
- Accepting or rejecting ADRs.
- Approving visual snapshot baselines after looking at the screenshots.
- Judging the UI by using it.
- Signing off each release.

## One task, one session

1. Start a fresh session. In Claude Code, run `/next-task`; with other agents, say "Take the next task following AGENTS.md".
2. Let it state its plan. Interrupt only if the plan touches files or packages the task shouldn't.
3. Watch for the red step: it should show the new tests failing for the right reasons before writing code.
4. When it finishes, review the diff (`/review` helps) and use the checklist below.
5. If the work is good, keep the commit. If not, ask for fixes in the same session, or discard with `git reset --hard HEAD~1` and start again with clearer guidance.

## Review checklist

- [ ] The tests match the task's list and really check the behaviour, not just that code runs.
- [ ] No test was weakened, skipped or deleted.
- [ ] The change stays inside the packages the task names.
- [ ] No new dependency appeared in any `package.json`.
- [ ] Model changes go through commands; the UI goes through the facade.
- [ ] `npm run check` passed, and the task is ticked in `plan/ROADMAP.md` with a line in `plan/LOG.md`.

## At the end of every milestone

- Run `/audit <package>` for each package the milestone touched, and turn real findings into tasks.
- Run `/status` and read the log for recurring surprises.
- Read the next milestone's tasks. Tasks for later releases were written ahead of time, so refine them now: sharpen tests, and use `/split-task` on anything too big.

## When the agent gets stuck

- Two failed attempts at the same task means the task is too big or unclear. Reset to the last green commit, then split the task or add notes to it.
- If it keeps wanting to break a rule, the rule or the spec may be wrong. Ask for an ADR with `/adr`, decide, then continue.
- Keep sessions short. A fresh session with the task file and log beats a long session that has lost track.

## Keeping the documents true

The split files in `docs/` are the source of truth. Change them only through an accepted ADR, in the same commit that implements the change, so the specification, the guidelines and the code never disagree.

## Releases

Each release ends with an exit task (0704, 1202, 1706, 2005, 2304, 2605) that scripts the release's exit criteria. Tag the release yourself after the exit test passes and you've used the build.
