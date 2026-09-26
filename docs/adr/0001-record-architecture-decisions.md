# 0001 Record architecture decisions

Status: Accepted
Date: 2026-09-26

## Context and problem

An AI agent writes all of the code, so decisions must live in the repository where every session can read them. Otherwise the agent re-decides settled questions, or drifts from the specification.

## Decision outcome

Record decisions as MADR files in `docs/adr/`, numbered in order. An ADR is required for changes to the architecture, file formats, the plugin API, command semantics, the worker protocol, kernel semantics, dependencies, security and the guideline documents. The agent may draft ADRs as Proposed; only the human accepts them.

## Consequences

- Good: settled questions stay settled across sessions.
- Bad: small overhead for significant changes, which is the point.
