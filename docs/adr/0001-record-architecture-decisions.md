# 1. Record architecture decisions

- Status: accepted
- Date: 2026-10-29

## Context

Most of this repo is built by agents, which have no memory between sessions. Decisions and their reasons must be written down.

## Decision

We keep Architecture Decision Records in docs/adr/. They are append-only: accepted ADRs are superseded by new ones, never edited.

## Consequences

Agents can learn why things are the way they are. Writing an ADR costs a little time for each significant decision.
