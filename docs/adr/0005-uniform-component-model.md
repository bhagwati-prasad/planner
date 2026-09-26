# 0005 Uniform component model with optional inner systems

Status: Accepted
Date: 2026-09-26

## Context and problem

The architecture is a graph of components, every component needs state and public and private methods, and every component must be able to contain its own architecture at any depth.

## Decision outcome

Every component has properties, typed state, public methods, private methods, metrics and ports. Any component may own an inner system whose boundary ports mirror its ports and whose inner components implement its public methods through bindings. Each component runs as a black box or expanded, chosen per run. There is no separate atomic or composite type.

## Consequences

- Good: one model at every level; encapsulation holds recursively; "open as system" works on anything.
- Bad: every feature touching systems must handle bindings and depth, so all traversal goes through the resolver.
- See spec §5 to §7, and engineering guidelines §9 and §10.
