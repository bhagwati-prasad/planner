# 0013 Console help metadata has its own budget

Status: Accepted
Date: 2026-09-27

## Context and problem

Eng §20 requires help metadata (summary, signature, example) for every facade method, and it powers `strata.help()` (spec §18). Task 0120 generates that metadata from the facade's JSDoc into `packages/facade/src/help-data.js`, so the facade has it at runtime in Node, in the browser and from `file://`. For 144 methods and 36 getters, it is 19.0 KB minified. Most of that is text: 9.3 KB of summaries and 4.8 KB of examples.

Eng §15 budgets "Core, facade and non-UI packages (minified)" at 250 KB, and the size check counts every file under those packages' `src/`. Core was at 247.4 KB before 0120, and the generated metadata takes it to 262.5 KB. The hand-written help it replaces saves 4.3 KB. Even without getters, and in the leanest encoding, the total lands near 258 KB.

## Decision drivers

- Keep the 250 KB core budget meaningful as a limit on code, which the browser must parse and compile before Strata is interactive (eng §15, offline startup in 2 s).
- Help for every facade method, as eng §20 and task 0120 require, without trimming examples to fit.
- Everything works offline from `file://`, including `strata.help()`.
- No hidden growth: the help text is measured and budgeted like everything else.

## Considered options

1. **A budget line of its own.** Eng §15 gets "Console help metadata (minified): 25 KB", measured on `help-data.js`. The core line no longer counts that file.
2. **An exception under the size policy.** Record the core measure at 262.5 KB, owned by a task that shrinks core by about 13 KB.
3. **Load the help lazily.** The build ships the metadata outside the startup bundle, as a separate file or as JSON inlined in `strata.html`, and reads it on the first `strata.help()`.
4. **Trim the help to fit.** Examples only for the most-used methods, and no getters.

## Decision outcome

Chosen option: 1, decided by the human on 2026-09-27. The metadata is one frozen object literal of strings: no functions, and nothing runs until `strata.help()` reads it. Measuring it apart keeps the core budget about code. It still caps the help text itself, and 25 KB leaves room for the facade methods later milestones add (run controls, the debugger, comments). Option 2 has nothing obvious to cut, because the core measure sums every source file, so tree-shaking would not help. Option 3 adds a build step and a second loading path for one small file. Option 4 contradicts eng §20.

## Consequences

- Good: core stays at 243.5 KB of 250 KB, and the 0119 test that it needs no exception holds.
- Good: `strata.help()` covers every method, generated from the same JSDoc that the lint rule checks.
- Bad: the metadata still ships in the startup bundle and adds its bytes to the download. That is 19 KB before gzip, and repetitive text compresses well.
- Bad: one more budget line to keep, measured by `tools/ci/size.js`.
- Follow-up tasks: none. A task that adds facade methods regenerates the file (`npm run generate:help`), and the size check holds it to 25 KB.

## Pros and cons of the options

### Option 1: a budget line of its own

- Good, because each budget measures one kind of cost: code for core, text for help.
- Bad, because a new line in eng §15 changes a guideline, which is why this ADR exists.

### Option 2: an exception under the size policy

- Good, because it needs no guideline change.
- Bad, because the owning task has no clear way to bring core back within budget.

### Option 3: load the help lazily

- Good, because the startup bundle does not grow at all.
- Bad, because `file://` cannot fetch modules, so the offline build needs its own path, and the help would work differently in Node and in the browser.

### Option 4: trim the help to fit

- Good, because nothing changes in the budgets.
- Bad, because it breaks eng §20 and task 0120's goal.
