# 0007 In-house real-time sync

Status: Accepted
Date: 2026-09-26

## Context and problem

R4 needs real-time co-editing of the model and doc text. Libraries such as Yjs would conflict with the vanilla, zero-dependency approach.

## Decision outcome

Build sync in-house: a server-ordered op log with optimistic client apply and rebase for model commands, last-writer-wins with a visible notice for same-field conflicts, and an in-house sequence CRDT for doc bodies.

## Consequences

- Good: no dependency; sync reuses the command bus.
- Bad: the text CRDT needs heavy property testing; tasks 2103 and 2202 carry that load.
- See spec §20 and §21.
