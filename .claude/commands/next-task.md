---
description: Take the next Strata task and complete it test-first
argument-hint: [task-id]
---
Follow the "Every session" and "Test-driven development" sections of CLAUDE.md exactly.

Task requested: $ARGUMENTS

If no task id was given, choose the first unchecked task in plan/ROADMAP.md whose dependencies are all checked, and say which one you chose.

1. Read the task file, every section it links under "Read first", and the last five lines of plan/LOG.md.
2. State your plan: the files you will create or change and the tests you will write.
3. Write the tests listed under "Tests to write first". Run them and show that each one fails for the reason it describes.
4. Implement until they pass, then refactor with every test green.
5. Run `npm run check` and fix anything that fails.
6. Set the task status to done, tick it in plan/ROADMAP.md, append one line to plan/LOG.md, and commit.

Stop after this one task.
