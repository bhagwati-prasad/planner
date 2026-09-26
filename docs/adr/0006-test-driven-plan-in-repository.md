# 0006 Test-driven development with the plan in the repository

Status: Accepted
Date: 2026-09-26

## Context and problem

An AI agent is the only developer. It needs small, verifiable units of work and a plan it can read and update, without a separate tracker.

## Decision outcome

The plan lives in `plan/` as Markdown: milestones are folders, tasks are files, and every task lists the tests to write first. Each session takes one task through red, green and refactor and ends with `npm run check` passing and one commit. Jira or another tracker is revisited when other people join, around R3 or R4.

## Consequences

- Good: every change is backed by tests written before the code; progress is visible in git.
- Bad: tasks for later releases were written ahead of time and must be refined at the start of their milestone.
