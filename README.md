# Strata starter kit

Everything an AI coding agent needs to build Strata test-first: the specification and guidelines split into small files, a roadmap of 153 tasks across all six releases, agent instructions, custom commands and the decisions already made.

## What's inside

| Path | Contents |
| --- | --- |
| `CLAUDE.md` | Instructions Claude Code reads every session |
| `AGENTS.md` | The same instructions for other coding agents |
| `.claude/commands/` | Custom commands: `/next-task`, `/review`, `/audit`, `/adr`, `/split-task`, `/status` |
| `plan/ROADMAP.md` | Releases R0–R5, 27 milestones, 153 tasks with dependencies |
| `plan/M00-…/` to `plan/M26-…/` | One Markdown file per task, each with tests to write first |
| `plan/TASK_TEMPLATE.md`, `plan/LOG.md` | Template for new tasks; the session log |
| `docs/spec/` | Product and Technical Specification 2.0, one file per section |
| `docs/guidelines/engineering/` | Engineering Guidelines 2.0, one file per section |
| `docs/guidelines/design-system/` | UI/UX Design System 2.0, one file per section |
| `docs/adr/` | ADR template and seven accepted decisions |
| `docs/process/workflow.md` | How to work with the agent: review checklist, milestone routine, getting unstuck |

## Getting started

1. Create an empty git repository, copy this kit into it and commit it.
2. Install Node 20 or later, and your coding agent.
3. Open the repository in Claude Code and run `/next-task`. With another agent, ask it to "take the next task following AGENTS.md".
4. Review each finished task using `docs/process/workflow.md`, then start the next one in a fresh session.

The first task, 0001, creates the repository scaffold. Task 0007 adds `npm run check`, which every later task must pass before committing.

## How the plan is organised

- **Releases** R0 to R5 follow the specification's roadmap. R0 alone, 80 tasks, delivers the offline app with a working simulator.
- **Milestones** group related tasks. M00 builds tooling, CI and a walking skeleton that proves the risky parts (`file://` loading, Blob workers, the bundler and determinism) in the first week.
- **Tasks** are sized for one session and one commit. Each lists the tests to write first, and ends with every test green and `npm run check` passing.
- Later releases were planned ahead of time, so refine their tasks at the start of each milestone.

## Claude Code notes

Files in `.claude/commands/` become slash commands named after the file. Claude Code also accepts the same commands as skills in `.claude/skills/<name>/SKILL.md`; either format works.

## Step in - Later considerations
- Some tasks wait for your decision before starting: exact D3 and Three.js versions (0006), server storage and dependencies (2101, 2401), the SAML library (2402) and the billing provider (2604).
- Tasks for R3–R5 were planned well ahead. Refine them with /split-task when their milestone begins.