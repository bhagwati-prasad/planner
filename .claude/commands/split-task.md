---
description: Propose splitting a task into session-sized tasks
argument-hint: <task-id>
---
Task $ARGUMENTS is too large for one session. Propose a split:

1. Read the task file and its linked sections.
2. Propose 2 to 5 new tasks using plan/TASK_TEMPLATE.md. Each needs its own tests to write first, and each must end with all tests passing.
3. Give each an id that keeps the milestone prefix (for example 0403a, 0403b), and list their dependencies, including tasks that currently depend on $ARGUMENTS.

Show the proposal and wait for approval. After approval, create the files, replace the original entry in plan/ROADMAP.md, and mark the original task file as split.
