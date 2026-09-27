# 0012 How compound commands plan their changes

Status: Proposed
Date: 2026-09-27

## Context and problem

Eng §7 says: "Compound operations such as `system.extract` use a pure planner that emits primitive commands. The bus applies them atomically as one batch, which is one undo step." Task 0112's goal is "pure planners that produce command batches for extract and inline".

Today `system.extract` and `system.inline` are single commands. Their handlers change the model through one transaction, which the bus commits as one operation: one op-log entry and one undo step. Replay reruns the handler.

The existing primitive commands cannot express extract as a batch, for two reasons:

- Nothing moves a node into another system. Moving the selected nodes one at a time would leave edges between moved and unmoved nodes crossing levels (`E_EDGE_CROSS_LEVEL`) in between.
- Nothing creates a composite that owns a new system. `node.place` by value copies the system, so the batch cannot know the ids of the copy it must wire next.

So following eng §7 to the letter needs new public commands, which is a choice for the human.

## Decision drivers

- One undo step and deterministic replay for extract and inline. Both already hold.
- Planners that can be tested and previewed without changing the model (eng §7).
- No public commands without a use beyond one compound operation, and no second way to change the model.

## Considered options

1. **New primitive commands, planners emit public commands.** Add `node.move { ids, systemId }`, which moves nodes together with the edges among them and refuses edges that would cross levels. Also add `node.own { systemId, innerSystemRef, id }`, which creates a System component owning an existing, unplaced system. The planners return lists of `{ type, payload }`, and `system.extract` runs them with `ctx.exec` as one operation.
2. **Planners return entity changes.** `planExtract` and `planInline` are pure functions that return the entities to create, change and delete (`{ kind, id, value }`, the shape `model.restore` already uses). The command applies them in one transaction. Eng §7 is reworded to "a pure planner that returns the changes".
3. **Keep transactional handlers.** Extract and inline stay single commands whose handlers write through the transaction. Eng §7 and task 0112 drop the planner requirement.

## Decision outcome

Proposed: option 1. It follows eng §7 as written. `node.move` is also what dragging components into or out of a system needs later (M03), so neither new command exists for extract alone. The planners stay pure: they read the model and return commands, and previews and tests can run them without applying anything.

## Consequences

- Good: compound operations read as sequences of ordinary commands, each validated by its own rules, so extract cannot build a state that a primitive would refuse.
- Good: the planners are plain functions over a snapshot, easy to property-test (task 0112's `inline(extract(x)) = x`).
- Bad: two new public commands, each needing a payload generator, an inverse round-trip and facade help in 0115.
- Bad: the extract and inline handlers are rewritten around the planners; their existing tests must still pass unchanged.

## Pros and cons of the options

### Option 1: new primitives

- Good, because it is what eng §7 says, and the primitives have later uses.
- Bad, because it widens the command set.

### Option 2: planners return entity changes

- Good, because it adds no commands.
- Bad, because entity writes skip command validation, a second way to change the model.

### Option 3: keep transactional handlers

- Good, because it is no work.
- Bad, because extract and inline stay hard to preview or test in isolation, and eng §7 has to change.
